/**
 * Durable write queue ("outbox") for field edits.
 *
 * Every change is saved on the device first (IndexedDB in the app), then sent
 * when there's signal, so a check-in, note or photo made in a dead zone or
 * just before the phone kills the tab is never lost.
 *
 * Two kinds of entry, both keyed so repeats are harmless:
 * - updates (`update(kind, id, fields)`): fields for one row MERGE into one
 *   entry, newest value wins. Sending is an idempotent UPDATE, so if an edit
 *   arrives while a send is in flight the entry is simply sent again.
 * - items (`add(kind, payload)`): one-off work such as a photo upload, keyed
 *   by `payload.id`. Handlers must make re-running safe.
 *
 * A send that fails for lack of signal stays queued and is retried. One the
 * server refuses (permissions, a deleted site) is marked failed and kept for
 * the user to retry or discard, instead of retrying forever.
 *
 * Entries belong to the user who made them (`setUser`): nothing is sent while
 * signed out (an UPDATE without a session matches no rows and "succeeds", so
 * the change would vanish), and on a shared phone one agent's queue is never
 * sent under the next agent's login.
 */

/** Errors worth retrying later: no signal, timeouts, rate limits, server faults. */
export const isTransientError = (error, online = true) => {
    if (!online) return true;
    const status = Number(error?.status ?? error?.statusCode);
    if (status) return status === 408 || status === 429 || status >= 500;
    // PostgREST/Postgres errors carry a code (e.g. 42501 RLS, 23503 FK); a
    // network failure surfaces as a code-less "Failed to fetch"
    return !error?.code;
};

export const createOutbox = ({
    storage,
    handlers,
    delay = 2000,
    retryDelay = 15000,
    isOnline = () => navigator.onLine,
    onError = (entry, error) => console.error(`Outbox ${entry.key} failed:`, error),
}) => {
    const entries = new Map(); // key -> { key, kind, id, payload, mode, version, failed? }
    const inFlight = new Set();
    const timers = new Map();
    const listeners = new Set();
    let ready = Promise.resolve();
    let user; // undefined: not told yet (tests, before auth); null: signed out

    const snapshot = () => {
        // Only the signed-in user's work: another agent's queue on a shared
        // phone isn't theirs to see or discard
        const all = [...entries.values()].filter((e) => !user || !e.owner || e.owner === user);
        return {
            pending: all.filter((e) => !e.failed).length,
            photos: all.filter((e) => !e.failed && e.kind === 'photo').length,
            failed: all.filter((e) => e.failed),
            syncing: inFlight.size > 0,
        };
    };
    let current = snapshot();
    const emit = () => {
        current = snapshot();
        listeners.forEach((fn) => fn(current));
    };

    const persist = (entry) => storage.set(entry.key, entry).catch((error) => console.error('Outbox save failed:', error));

    const send = async (key) => {
        const entry = entries.get(key);
        if (!entry || entry.failed || inFlight.has(key)) return;
        if (!isOnline()) return; // the `online` event drains everything
        // Owned work waits until auth confirms that exact user is signed in
        if (user === null || (entry.owner && entry.owner !== user)) return;

        const sentVersion = entry.version;
        inFlight.add(key);
        emit();
        try {
            await handlers[entry.kind](entry.id, entry.payload);
            // An edit that arrived mid-send keeps the entry; it goes again
            if (entries.get(key)?.version === sentVersion) {
                entries.delete(key);
                await storage.del(key);
            } else {
                schedule(key, 0);
            }
        } catch (error) {
            const latest = entries.get(key);
            if (latest && isTransientError(error, isOnline())) {
                schedule(key, retryDelay);
            } else if (latest) {
                latest.failed = { message: error?.message ?? String(error), at: Date.now() };
                persist(latest);
                onError(latest, error);
            }
        } finally {
            inFlight.delete(key);
            emit();
        }
    };

    const schedule = (key, wait) => {
        clearTimeout(timers.get(key));
        timers.set(key, setTimeout(() => {
            timers.delete(key);
            send(key);
        }, wait));
    };

    const put = (entry, wait) => {
        entries.set(entry.key, entry);
        persist(entry);
        emit();
        schedule(entry.key, wait);
    };

    return {
        /** Loads what a previous session left queued, then tries to send it */
        start() {
            ready = storage.getAll().then((saved) => {
                for (const entry of saved) if (!entries.has(entry.key)) entries.set(entry.key, entry);
                emit();
                this.drain();
            }).catch((error) => console.error('Outbox load failed:', error));
            return ready;
        },
        ready: () => ready,

        update(kind, id, fields, { immediate = false } = {}) {
            const key = `${kind}:${id}`;
            const existing = entries.get(key);
            put({
                key, kind, id, mode: 'update', owner: user ?? existing?.owner,
                payload: { ...existing?.payload, ...fields },
                version: (existing?.version ?? 0) + 1,
            }, immediate ? 0 : delay);
        },

        add(kind, payload) {
            put({ key: `${kind}:${payload.id}`, kind, id: payload.id, mode: 'item', owner: user, payload, version: 1 }, 0);
        },

        /** Who is signed in (null when nobody); sends their waiting work */
        setUser(userId) {
            user = userId;
            emit();
            if (userId) this.drain();
        },

        /** Sends everything that isn't failed (e.g. back online, tab hidden) */
        drain() {
            return Promise.all([...entries.keys()].map((key) => {
                clearTimeout(timers.get(key));
                timers.delete(key);
                return send(key);
            }));
        },

        retry(key) {
            const entry = entries.get(key);
            if (!entry) return;
            delete entry.failed;
            persist(entry);
            emit();
            schedule(key, 0);
        },

        async discard(key) {
            clearTimeout(timers.get(key));
            entries.delete(key);
            await storage.del(key);
            emit();
        },

        /** Unsent fields for one row, to lay over fresh server data */
        pendingFields(kind, id) {
            const entry = entries.get(`${kind}:${id}`);
            return entry?.mode === 'update' ? entry.payload : undefined;
        },

        /** Queued items of one kind (e.g. photos waiting to upload) */
        pendingItems(kind) {
            return [...entries.values()].filter((e) => e.kind === kind && e.mode === 'item').map((e) => e.payload);
        },

        getSnapshot: () => current,
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
    };
};

/** In-memory storage, for tests and browsers without IndexedDB */
export const memoryStorage = () => {
    const data = new Map();
    return {
        getAll: async () => [...data.values()].map((e) => structuredClone(e)),
        set: async (key, value) => { data.set(key, structuredClone(value)); },
        del: async (key) => { data.delete(key); },
    };
};
