import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSiteSyncQueue } from './siteSyncQueue';

describe('createSiteSyncQueue', () => {
    let save;

    beforeEach(() => {
        vi.useFakeTimers();
        save = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('debounces edits to one site into a single save', async () => {
        const q = createSiteSyncQueue({ save, delay: 2000 });
        q.queue('a', { notes: 'h' });
        q.queue('a', { notes: 'hello' });

        await vi.advanceTimersByTimeAsync(1999);
        expect(save).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith('a', { notes: 'hello' });
    });

    // Regression: the old shared debounce kept only the last call, so site A's
    // notes were lost when site B was checked within 2 seconds
    it('keeps edits to different sites independent', async () => {
        const q = createSiteSyncQueue({ save, delay: 2000 });
        q.queue('a', { notes: 'cabinet locked' });
        q.queue('b', { is_checked: true });

        await vi.advanceTimersByTimeAsync(2000);
        expect(save).toHaveBeenCalledWith('a', { notes: 'cabinet locked' });
        expect(save).toHaveBeenCalledWith('b', { is_checked: true });
    });

    // Regression: typing a note then tapping Check dropped the note
    it('merges different fields for the same site', async () => {
        const q = createSiteSyncQueue({ save, delay: 2000 });
        q.queue('a', { notes: 'ok' });
        q.queue('a', { is_checked: true });

        await q.flush('a');
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith('a', { notes: 'ok', is_checked: true });
    });

    it('flush saves immediately and cancels the pending timer', async () => {
        const q = createSiteSyncQueue({ save, delay: 2000 });
        q.queue('a', { is_checked: true });
        await q.flush('a');
        await vi.advanceTimersByTimeAsync(5000);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('flushAll saves every pending site', async () => {
        const q = createSiteSyncQueue({ save, delay: 2000 });
        q.queue('a', { notes: '1' });
        q.queue('b', { notes: '2' });
        await q.flushAll();
        expect(save).toHaveBeenCalledTimes(2);
        expect(q.hasPending()).toBe(false);
    });

    it('re-queues a failed save and retries without overwriting newer edits', async () => {
        save.mockRejectedValueOnce(new Error('offline'));
        const onStatus = vi.fn();
        const q = createSiteSyncQueue({ save, delay: 2000, retryDelay: 10000, onStatus });

        q.queue('a', { notes: 'old', is_checked: true });
        await q.flush('a');
        expect(onStatus).toHaveBeenLastCalledWith('error', expect.any(Error));
        expect(q.hasPending()).toBe(true);

        q.queue('a', { notes: 'new' });
        await vi.advanceTimersByTimeAsync(2000);
        expect(save).toHaveBeenLastCalledWith('a', { notes: 'new', is_checked: true });
        expect(onStatus).toHaveBeenLastCalledWith('saved');
    });

    it('retries on its own after retryDelay', async () => {
        save.mockRejectedValueOnce(new Error('offline'));
        const q = createSiteSyncQueue({ save, retryDelay: 10000 });
        q.queue('a', { notes: 'x' });
        await q.flush('a');

        await vi.advanceTimersByTimeAsync(10000);
        expect(save).toHaveBeenCalledTimes(2);
        expect(q.hasPending()).toBe(false);
    });

    it('does nothing when flushing a site with no pending changes', async () => {
        const q = createSiteSyncQueue({ save });
        await q.flush('nope');
        expect(save).not.toHaveBeenCalled();
    });
});
