import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable supabase-js stand-in; each awaited query takes the next queued result
const results = [];
const log = [];
const builder = new Proxy({}, {
    get(_, prop) {
        if (prop === 'then') return (resolve) => resolve(results.shift() ?? { data: [], error: null });
        return (...args) => { log.push([prop, ...args]); return builder; };
    }
});
const storage = { remove: vi.fn(), upload: vi.fn() };
const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: (table) => { log.push(['from', table]); return builder; },
        storage: { from: () => storage },
        rpc: (...a) => rpc(...a),
    },
}));

const { removePhotoFiles, deleteSite, attachThumbnail } = await import('./siteRepository');
const { deleteTrip } = await import('../trips/tripRepository');

beforeEach(() => {
    results.length = 0;
    log.length = 0;
    storage.remove.mockReset().mockImplementation(async (paths) => { log.push(['remove', paths]); return { error: null }; });
    storage.upload.mockReset().mockResolvedValue({ error: null });
    rpc.mockReset();
});

describe('removePhotoFiles', () => {
    it('removes photos and thumbnails in batches of 100', async () => {
        const photos = Array.from({ length: 60 }, (_, i) => ({ storage_path: `u/p${i}.jpg`, thumb_path: i % 2 ? `u/p${i}_t.jpg` : null }));
        await removePhotoFiles(photos);
        expect(storage.remove).toHaveBeenCalledTimes(1);
        expect(storage.remove.mock.calls[0][0]).toHaveLength(90);

        await removePhotoFiles(Array.from({ length: 150 }, (_, i) => ({ storage_path: `u/q${i}.jpg` })));
        expect(storage.remove.mock.calls.slice(1).map(([paths]) => paths.length)).toEqual([100, 50]);
    });
});

describe('deleting removes the photo files first', () => {
    it('site: files, then the row', async () => {
        results.push({ data: [{ storage_path: 'u/s1/a.jpg', thumb_path: 'u/s1/a_thumb.jpg' }], error: null });
        await deleteSite('s1');
        const order = log.filter(([op]) => op === 'remove' || op === 'delete').map(([op]) => op);
        expect(order).toEqual(['remove', 'delete']);
        expect(log).toContainEqual(['remove', ['u/s1/a.jpg', 'u/s1/a_thumb.jpg']]);
    });

    it("trip: every site's files, then the trip", async () => {
        results.push({ data: [{ storage_path: 'u/s1/a.jpg', thumb_path: null }, { storage_path: 'u/s2/b.jpg', thumb_path: null }], error: null });
        results.push({ data: [{ id: 't1' }], error: null });
        await deleteTrip('t1');
        expect(log).toContainEqual(['eq', 'sites.trip_id', 't1']);
        const order = log.filter(([op]) => op === 'remove' || op === 'delete').map(([op]) => op);
        expect(order).toEqual(['remove', 'delete']);
    });

    it('stops before deleting if storage refuses, so no files are orphaned', async () => {
        results.push({ data: [{ storage_path: 'u/s1/a.jpg' }], error: null });
        storage.remove.mockResolvedValue({ error: { statusCode: '403', message: 'denied' } });
        await expect(deleteTrip('t1')).rejects.toMatchObject({ statusCode: '403' });
        expect(log.some(([op]) => op === 'delete')).toBe(false);
    });
});

describe('attachThumbnail', () => {
    it("stores the thumbnail in the caller's folder and attaches it", async () => {
        rpc.mockResolvedValue({ data: true, error: null });
        const blob = new Blob(['t'], { type: 'image/jpeg' });
        expect(await attachThumbnail({ photoId: 'p1', userId: 'mgr', blob })).toBe(true);
        expect(storage.upload).toHaveBeenCalledWith('mgr/thumbs/p1.jpg', blob, { contentType: 'image/jpeg' });
        expect(rpc).toHaveBeenCalledWith('set_photo_thumbnail', { p_photo_id: 'p1', p_thumb_path: 'mgr/thumbs/p1.jpg' });
        expect(storage.remove).not.toHaveBeenCalled();
    });

    it('removes the uploaded file again when the database will not attach it', async () => {
        rpc.mockResolvedValue({ data: false, error: null });
        expect(await attachThumbnail({ photoId: 'p1', userId: 'mgr', blob: new Blob(['t']) })).toBe(false);
        expect(storage.remove).toHaveBeenCalledWith(['mgr/thumbs/p1.jpg']);

        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'function not found' } });
        await expect(attachThumbnail({ photoId: 'p2', userId: 'mgr', blob: new Blob(['t']) })).rejects.toMatchObject({ code: 'PGRST202' });
        expect(storage.remove).toHaveBeenLastCalledWith(['mgr/thumbs/p2.jpg']);
    });
});
