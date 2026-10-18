import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal chainable stand-in for the Supabase client
const db = { result: { data: [], error: null }, calls: [] };
const chain = () => {
    const q = {
        select: () => q, in: (...a) => { db.calls.push(['in', ...a]); return q; },
        order: () => Promise.resolve(db.result),
        delete: () => q, eq: (...a) => { db.calls.push(['eq', ...a]); return Object.assign(Promise.resolve(db.result), q); },
        maybeSingle: () => Promise.resolve(db.lookup ?? { data: null, error: null }),
        insert: (rows) => { db.calls.push(['insert', rows]); return Promise.resolve({ error: null }); },
    };
    return q;
};
const storage = { createSignedUrls: vi.fn(), remove: vi.fn(), download: vi.fn(), upload: vi.fn() };
vi.mock('../../lib/supabase', () => ({
    supabase: { from: () => chain(), storage: { from: () => storage } },
}));

const { fetchSitePhotos, deleteSitePhoto, uploadSitePhoto } = await import('./siteRepository');

describe('fetchSitePhotos', () => {
    beforeEach(() => {
        db.calls = [];
        Object.values(storage).forEach((fn) => fn.mockReset());
    });

    it("doesn't query when there are no sites", async () => {
        expect(await fetchSitePhotos([])).toEqual({ photos: [], urlsFailed: false });
        expect(db.calls).toEqual([]);
    });

    it('signs photos and thumbnails in one request', async () => {
        db.result = { data: [
            { id: 'p1', storage_path: 'u/s1/a.jpg', thumb_path: 'u/s1/a_thumb.jpg' },
            { id: 'p0', storage_path: 'u/s1/old.jpg', thumb_path: null },
        ], error: null };
        storage.createSignedUrls.mockResolvedValue({ data: [
            { path: 'u/s1/a.jpg', signedUrl: 'https://signed/a' },
            { path: 'u/s1/a_thumb.jpg', signedUrl: 'https://signed/a_thumb' },
            { path: 'u/s1/old.jpg', signedUrl: 'https://signed/old' },
        ], error: null });

        const { photos, urlsFailed } = await fetchSitePhotos(['s1']);
        expect(db.calls[0]).toEqual(['in', 'site_id', ['s1']]);
        expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
        expect(photos[0]).toMatchObject({ url: 'https://signed/a', thumbUrl: 'https://signed/a_thumb' });
        // From before thumbnails: the list falls back to the original
        expect(photos[1].thumbUrl).toBe('https://signed/old');
        expect(urlsFailed).toBe(false);
    });

    it('still returns the records when signing fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        db.result = { data: [{ id: 'p1', storage_path: 'u/s1/a.jpg' }], error: null };
        storage.createSignedUrls.mockResolvedValue({ data: null, error: new Error('down') });

        const { photos, urlsFailed } = await fetchSitePhotos(['s1']);
        expect(photos).toEqual([{ id: 'p1', storage_path: 'u/s1/a.jpg', url: null, thumbUrl: null }]);
        expect(urlsFailed).toBe(true);
    });
});

describe('deleteSitePhoto', () => {
    beforeEach(() => { db.calls = []; });

    it('removes the file before the record (the manager storage policy reads the record)', async () => {
        const order = [];
        storage.remove.mockReset().mockImplementation(async () => { order.push('file'); return { error: null }; });
        db.result = { data: null, error: null };
        await deleteSitePhoto({ id: 'p1', storage_path: 'u/s1/a.jpg', thumb_path: 'u/s1/a_thumb.jpg' });
        order.push(...db.calls.map(([, column]) => `record:${column}`));
        expect(order).toEqual(['file', 'record:id']);
        expect(storage.remove).toHaveBeenCalledWith(['u/s1/a.jpg', 'u/s1/a_thumb.jpg']);
    });

    it('keeps the record when the file delete is refused', async () => {
        storage.remove.mockReset().mockResolvedValue({ error: new Error('RLS') });
        await expect(deleteSitePhoto({ id: 'p1', storage_path: 'u/s1/a.jpg' })).rejects.toThrow('RLS');
        expect(db.calls).toEqual([]);
    });
});

describe('uploadSitePhoto', () => {
    const photo = { id: 'p1', userId: 'u1', siteId: 's1', file: new Blob(['x'], { type: 'image/jpeg' }), fileName: 'IMG_1.HEIC' };

    beforeEach(() => {
        db.calls = [];
        db.lookup = undefined;
        storage.upload.mockReset().mockResolvedValue({ error: null });
    });

    it('stores the photo and its thumbnail under the user id, with when and where it was taken', async () => {
        const thumb = new Blob(['t'], { type: 'image/jpeg' });
        const path = await uploadSitePhoto({ ...photo, thumb, takenAt: '2026-10-18T08:00:00.000Z', takenLat: -26, takenLng: 28 });
        expect(path).toBe('u1/s1/p1.jpg');
        expect(storage.upload).toHaveBeenCalledWith('u1/s1/p1.jpg', photo.file, { contentType: 'image/jpeg' });
        expect(storage.upload).toHaveBeenCalledWith('u1/s1/p1_thumb.jpg', thumb, { contentType: 'image/jpeg' });
        expect(db.calls.find(([op]) => op === 'insert')[1]).toEqual([{
            site_id: 's1', user_id: 'u1', storage_path: 'u1/s1/p1.jpg', thumb_path: 'u1/s1/p1_thumb.jpg', file_name: 'IMG_1.HEIC',
            taken_at: '2026-10-18T08:00:00.000Z', taken_lat: -26, taken_lng: 28,
        }]);
    });

    it('records no thumbnail when the phone could not make one', async () => {
        await uploadSitePhoto(photo);
        expect(storage.upload).toHaveBeenCalledTimes(1);
        expect(db.calls.find(([op]) => op === 'insert')[1][0]).toMatchObject({ thumb_path: null, taken_at: null });
    });

    it('is safe to repeat: an existing file and record are not duplicated', async () => {
        storage.upload.mockResolvedValue({ error: { statusCode: '409', message: 'The resource already exists' } });
        db.lookup = { data: { id: 'row1' }, error: null };
        await uploadSitePhoto(photo);
        expect(db.calls.some(([op]) => op === 'insert')).toBe(false);
    });

    it('throws other upload errors so the outbox can decide', async () => {
        storage.upload.mockResolvedValue({ error: { statusCode: '403', message: 'denied' } });
        await expect(uploadSitePhoto(photo)).rejects.toMatchObject({ statusCode: '403' });
    });
});
