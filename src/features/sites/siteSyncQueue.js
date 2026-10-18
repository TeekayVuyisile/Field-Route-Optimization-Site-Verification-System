/**
 * Per-site write buffer for debounced Supabase updates.
 *
 * Each site gets its own pending-changes object and its own timer. New
 * updates for a site are MERGED into what is already pending, so nothing is
 * dropped. The previous single shared lodash debounce kept only the last
 * call: editing site A's notes then checking site B within 2s lost A's notes.
 *
 * `save(siteId, updates)` must return a promise; a rejected save puts its
 * fields back in the buffer (without overwriting newer edits) and retries
 * after `retryDelay`.
 */
export const createSiteSyncQueue = ({ save, delay = 2000, retryDelay = 10000, onStatus = () => {} }) => {
    const pending = new Map();   // siteId -> merged updates
    const timers = new Map();    // siteId -> timeout id
    let inFlight = 0;

    const clearTimer = (siteId) => {
        clearTimeout(timers.get(siteId));
        timers.delete(siteId);
    };

    const flush = async (siteId) => {
        clearTimer(siteId);
        const updates = pending.get(siteId);
        if (!updates) return;
        pending.delete(siteId);

        inFlight += 1;
        onStatus('saving');
        try {
            await save(siteId, updates);
            inFlight -= 1;
            if (inFlight === 0) onStatus(pending.size > 0 ? 'pending' : 'saved');
        } catch (error) {
            inFlight -= 1;
            // Newer edits made while this save was in flight win over the failed ones
            pending.set(siteId, { ...updates, ...pending.get(siteId) });
            clearTimer(siteId);
            timers.set(siteId, setTimeout(() => flush(siteId), retryDelay));
            onStatus('error', error);
        }
    };

    const flushAll = () => Promise.all([...pending.keys()].map(flush));

    const queue = (siteId, updates) => {
        pending.set(siteId, { ...pending.get(siteId), ...updates });
        clearTimer(siteId);
        timers.set(siteId, setTimeout(() => flush(siteId), delay));
        onStatus('pending');
    };

    const cancelAll = () => {
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
    };

    return { queue, flush, flushAll, cancelAll, hasPending: () => pending.size > 0 };
};
