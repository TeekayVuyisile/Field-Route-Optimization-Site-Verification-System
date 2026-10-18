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

    it('attaches signed URLs to the records', async () => {
        db.result = { data: [{ id: 'p1', storage_path: 'u/s1/a.jpg' }], error: null };
        storage.createSignedUrls.mockResolvedValue({ data: [{ path: 'u/s1/a.jpg', signedUrl: 'https://signed/a' }], error: null });

        const { photos, urlsFailed } = await fetchSitePhotos(['s1']);
        expect(db.calls[0]).toEqual(['in', 'site_id', ['s1']]);
        expect(photos[0].url).toBe('https://signed/a');
        expect(urlsFailed).toBe(false);
    });

    it('still returns the records when signing fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        db.result = { data: [{ id: 'p1', storage_path: 'u/s1/a.jpg' }], error: null };
        storage.createSignedUrls.mockResolvedValue({ data: null, error: new Error('down') });

        const { photos, urlsFailed } = await fetchSitePhotos(['s1']);
        expect(photos).toEqual([{ id: 'p1', storage_path: 'u/s1/a.jpg', url: null }]);
        expect(urlsFailed).toBe(true);
    });
});

describe('deleteSitePhoto', () => {
    beforeEach(() => { db.calls = []; });

    it('removes the file before the record (the manager storage policy reads the record)', async () => {
        const order = [];
        storage.remove.mockReset().mockImplementation(async () => { order.push('file'); return { error: null }; });
        db.result = { data: null, error: null };
        await deleteSitePhoto({ id: 'p1', storage_path: 'u/s1/a.jpg' });
        order.push(...db.calls.map(([, column]) => `record:${column}`));
        expect(order).toEqual(['file', 'record:id']);
        expect(storage.remove).toHaveBeenCalledWith(['u/s1/a.jpg']);
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

    it('stores the file under the user id with a path made from the photo id', async () => {
        const path = await uploadSitePhoto(photo);
        expect(path).toBe('u1/s1/p1.jpg');
        expect(storage.upload).toHaveBeenCalledWith('u1/s1/p1.jpg', photo.file, { contentType: 'image/jpeg' });
        expect(db.calls.find(([op]) => op === 'insert')[1]).toEqual([
            { site_id: 's1', user_id: 'u1', storage_path: 'u1/s1/p1.jpg', file_name: 'IMG_1.HEIC' },
        ]);
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
