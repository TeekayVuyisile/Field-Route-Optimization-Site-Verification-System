import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSignedUrls = vi.fn();
const from = vi.fn(() => ({ createSignedUrls }));
vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from: (...args) => from(...args) } } }));

const { getSignedPhotoUrls } = await import('./siteRepository');

describe('getSignedPhotoUrls', () => {
    beforeEach(() => {
        createSignedUrls.mockReset();
        from.mockClear();
    });

    it('signs every path in one request against the site-photos bucket', async () => {
        createSignedUrls.mockResolvedValue({
            data: [
                { path: 'u1/s1/a.jpg', signedUrl: 'https://x/a?token=1', error: null },
                { path: 'u1/s2/b.jpg', signedUrl: 'https://x/b?token=2', error: null },
            ],
            error: null
        });

        const urls = await getSignedPhotoUrls(['u1/s1/a.jpg', 'u1/s2/b.jpg']);

        expect(from).toHaveBeenCalledWith('site-photos');
        expect(createSignedUrls).toHaveBeenCalledTimes(1);
        expect(createSignedUrls).toHaveBeenCalledWith(['u1/s1/a.jpg', 'u1/s2/b.jpg'], 3600);
        expect(urls.get('u1/s2/b.jpg')).toBe('https://x/b?token=2');
    });

    it('leaves out paths that could not be signed (missing file, no access)', async () => {
        createSignedUrls.mockResolvedValue({
            data: [
                { path: 'u1/s1/a.jpg', signedUrl: 'https://x/a', error: null },
                { path: 'u2/s9/z.jpg', signedUrl: null, error: 'Either the object does not exist or you do not have access to it' },
            ],
            error: null
        });

        const urls = await getSignedPhotoUrls(['u1/s1/a.jpg', 'u2/s9/z.jpg']);
        expect([...urls.keys()]).toEqual(['u1/s1/a.jpg']);
    });

    it('makes no request for zero photos', async () => {
        expect((await getSignedPhotoUrls([])).size).toBe(0);
        expect(createSignedUrls).not.toHaveBeenCalled();
    });

    it('throws when storage rejects the whole request', async () => {
        createSignedUrls.mockResolvedValue({ data: null, error: new Error('JWT expired') });
        await expect(getSignedPhotoUrls(['u1/s1/a.jpg'])).rejects.toThrow('JWT expired');
    });
});
