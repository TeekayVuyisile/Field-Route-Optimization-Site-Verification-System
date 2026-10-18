import { describe, it, expect, vi } from 'vitest';
import { checkInText, pickReportPhotos, preparePhotos } from './reportData';

describe('pickReportPhotos', () => {
    it('keeps the first few photos of each site', () => {
        const photos = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}`, site_id: n <= 5 ? 's1' : 's2' }));
        const picked = pickReportPhotos(photos, 4);
        expect(picked.get('s1').map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
        expect(picked.get('s2').map((p) => p.id)).toEqual(['p6']);
    });
});

describe('checkInText', () => {
    it('describes when and how far, or says nothing for unvisited sites', () => {
        expect(checkInText({ is_checked: false })).toBeNull();
        expect(checkInText({ is_checked: true, checked_at: '2026-10-18T09:42:00', check_distance_m: 34 }))
            .toBe('Checked in 18 Oct 2026, 09:42 · 34 m from the site');
        expect(checkInText({ is_checked: true, checked_at: '2026-10-18T09:42:00', check_flagged: true }))
            .toBe('Checked in 18 Oct 2026, 09:42 · no location');
        // Visited before verified check-ins existed
        expect(checkInText({ is_checked: true })).toBe('Checked in');
    });
});

describe('preparePhotos', () => {
    it('uses thumbnails, skips what fails or the PDF cannot embed, and reports progress', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const photos = [
            { id: 'a', thumbUrl: 'https://x/a_thumb', url: 'https://x/a' },
            { id: 'b', url: 'https://x/b' },              // older photo: no thumbnail
            { id: 'c', thumbUrl: 'https://x/c_thumb' },   // fails to download
            { id: 'd', thumbUrl: 'https://x/d_thumb' },   // a format the PDF can't embed
        ];
        const load = vi.fn(async (url) => {
            if (url.includes('/c')) throw new Error('offline');
            return new Blob(['img'], { type: url.includes('/d') ? 'image/heic' : 'image/jpeg' });
        });
        const progress = [];
        const images = await preparePhotos(photos, { load, shrink: async (b) => b, onProgress: (d, t) => progress.push(`${d}/${t}`) });

        expect(load).toHaveBeenCalledWith('https://x/a_thumb');
        expect(load).toHaveBeenCalledWith('https://x/b');
        expect([...images.keys()].sort()).toEqual(['a', 'b']);
        expect(images.get('a')).toMatch(/^data:image\/jpeg;base64,/);
        expect(progress.at(-1)).toBe('4/4');
    });
});
