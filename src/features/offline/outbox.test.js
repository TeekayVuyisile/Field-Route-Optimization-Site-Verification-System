import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOutbox, isTransientError, memoryStorage } from './outbox';

const offlineError = () => Object.assign(new Error('TypeError: Failed to fetch'), { code: '' });
const rlsError = () => Object.assign(new Error('new row violates row-level security policy'), { code: '42501' });

describe('isTransientError', () => {
    it('retries network failures, timeouts, rate limits and server faults', () => {
        expect(isTransientError(offlineError())).toBe(true);
        expect(isTransientError({ status: 503 })).toBe(true);
        expect(isTransientError({ statusCode: '429' })).toBe(true);
        expect(isTransientError(rlsError(), false)).toBe(true); // offline: never conclusive
    });

    it('gives up on refusals', () => {
        expect(isTransientError(rlsError())).toBe(false);
        expect(isTransientError({ statusCode: '403' })).toBe(false);
        expect(isTransientError({ code: '23503' })).toBe(false);
    });
});

describe('createOutbox', () => {
    let online;
    let site;
    let photo;
    let storage;
    const make = () => createOutbox({
        storage,
        handlers: { site, photo },
        delay: 2000,
        retryDelay: 15000,
        isOnline: () => online,
        onError: () => {},
    });

    beforeEach(() => {
        vi.useFakeTimers();
        online = true;
        site = vi.fn().mockResolvedValue(undefined);
        photo = vi.fn().mockResolvedValue(undefined);
        storage = memoryStorage();
    });
    afterEach(() => vi.useRealTimers());

    it('merges edits to one row and sends them once after the debounce', async () => {
        const outbox = make();
        outbox.update('site', 's1', { notes: 'Gate locked' });
        outbox.update('site', 's2', { is_checked: true });
        outbox.update('site', 's1', { is_checked: true });

        await vi.advanceTimersByTimeAsync(2000);
        expect(site).toHaveBeenCalledTimes(2);
        expect(site).toHaveBeenCalledWith('s1', { notes: 'Gate locked', is_checked: true });
        expect(outbox.getSnapshot().pending).toBe(0);
        expect(await storage.getAll()).toEqual([]);
    });

    it('sends immediately when asked (a check-in)', async () => {
        const outbox = make();
        outbox.update('site', 's1', { is_checked: true }, { immediate: true });
        await vi.advanceTimersByTimeAsync(0);
        expect(site).toHaveBeenCalledWith('s1', { is_checked: true });
    });

    it('keeps changes on the device while offline and sends them when drained', async () => {
        online = false;
        const outbox = make();
        outbox.update('site', 's1', { is_checked: true }, { immediate: true });
        await vi.advanceTimersByTimeAsync(60000);
        expect(site).not.toHaveBeenCalled();
        expect(outbox.getSnapshot().pending).toBe(1);

        online = true;
        await outbox.drain();
        expect(site).toHaveBeenCalledWith('s1', { is_checked: true });
        expect(outbox.getSnapshot().pending).toBe(0);
    });

    it('survives a restart: a new outbox sends what the last one saved', async () => {
        online = false;
        make().add('photo', { id: 'p1', siteId: 's1' });
        await vi.advanceTimersByTimeAsync(0);

        online = true;
        const next = make();
        await next.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(photo).toHaveBeenCalledWith('p1', { id: 'p1', siteId: 's1' });
    });

    it('retries a dropped connection later', async () => {
        site.mockRejectedValueOnce(offlineError());
        const outbox = make();
        outbox.update('site', 's1', { notes: 'x' }, { immediate: true });
        await vi.advanceTimersByTimeAsync(0);
        expect(outbox.getSnapshot().pending).toBe(1);

        await vi.advanceTimersByTimeAsync(15000);
        expect(site).toHaveBeenCalledTimes(2);
        expect(outbox.getSnapshot().pending).toBe(0);
    });

    it('marks a refused change as failed instead of retrying forever, and can retry or discard it', async () => {
        site.mockRejectedValueOnce(rlsError());
        const outbox = make();
        outbox.update('site', 's1', { notes: 'x' }, { immediate: true });
        await vi.advanceTimersByTimeAsync(60000);

        expect(site).toHaveBeenCalledTimes(1);
        const { failed, pending } = outbox.getSnapshot();
        expect(pending).toBe(0);
        expect(failed[0]).toMatchObject({ key: 'site:s1', failed: { message: expect.stringMatching(/row-level security/) } });

        outbox.retry('site:s1');
        await vi.advanceTimersByTimeAsync(0);
        expect(site).toHaveBeenCalledTimes(2);
        expect(outbox.getSnapshot().failed).toEqual([]);
    });

    it('sends again when an edit arrives while a send is in flight', async () => {
        let finish;
        site.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
        const outbox = make();
        outbox.update('site', 's1', { notes: 'first' }, { immediate: true });
        await vi.advanceTimersByTimeAsync(0);

        outbox.update('site', 's1', { notes: 'second' });
        finish();
        await vi.advanceTimersByTimeAsync(2000);

        expect(site).toHaveBeenLastCalledWith('s1', { notes: 'second' });
        expect(outbox.getSnapshot().pending).toBe(0);
    });

    it('exposes unsent fields so fresh server data can be overlaid', () => {
        online = false;
        const outbox = make();
        outbox.update('site', 's1', { is_checked: true });
        expect(outbox.pendingFields('site', 's1')).toEqual({ is_checked: true });
        expect(outbox.pendingFields('site', 's2')).toBeUndefined();
    });

    it('tells subscribers how much is waiting', () => {
        online = false;
        const outbox = make();
        const seen = [];
        outbox.subscribe((s) => seen.push(s.pending));
        outbox.update('site', 's1', { notes: 'a' });
        outbox.add('photo', { id: 'p1' });
        expect(seen.at(-1)).toBe(2);
        expect(outbox.getSnapshot().photos).toBe(1);
    });

    it("sends nothing while signed out, and only the owner's work after sign-in", async () => {
        const outbox = make();
        outbox.setUser('agent-a');
        online = false;
        outbox.update('site', 's1', { notes: 'from A' }, { immediate: true });
        outbox.setUser(null);
        online = true;
        await outbox.drain();
        expect(site).not.toHaveBeenCalled();

        outbox.setUser('agent-b');
        await vi.advanceTimersByTimeAsync(0);
        expect(site).not.toHaveBeenCalled();
        expect(outbox.getSnapshot().pending).toBe(0); // B doesn't see A's queue

        outbox.setUser('agent-a');
        await vi.advanceTimersByTimeAsync(0);
        expect(site).toHaveBeenCalledWith('s1', { notes: 'from A' });
    });
});
