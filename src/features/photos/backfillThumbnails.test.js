import { describe, it, expect, vi } from 'vitest';
import { backfillThumbnails } from './backfillThumbnails';

const jpeg = (name) => new Blob([name], { type: 'image/jpeg' });

describe('backfillThumbnails', () => {
    it('shrinks each original and attaches it, skipping what fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const photos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
        const originals = { a: jpeg('A'), b: jpeg('B'), c: new Blob(['heic'], { type: 'image/heic' }), d: jpeg('D') };
        const download = vi.fn(async (photo) => {
            if (photo.id === 'd') throw new Error('offline');
            return originals[photo.id];
        });
        // Can't decode HEIC: compressImage hands back the original
        const shrink = vi.fn(async (blob) => (blob.type === 'image/heic' ? blob : jpeg('thumb')));
        const attach = vi.fn(async ({ photoId }) => photoId !== 'b'); // b already had one
        const progress = [];

        const result = await backfillThumbnails(photos, { userId: 'mgr', download, shrink, attach, onProgress: (d, t) => progress.push(`${d}/${t}`) });

        expect(result).toEqual({ made: 1, skipped: 3 });
        expect(attach).toHaveBeenCalledWith({ photoId: 'a', userId: 'mgr', blob: expect.any(Blob) });
        expect(attach).not.toHaveBeenCalledWith(expect.objectContaining({ photoId: 'c' }));
        expect(progress).toEqual(['1/4', '2/4', '3/4', '4/4']);
    });

    it('stops with a clear message when the database update is missing', async () => {
        const attach = vi.fn().mockRejectedValue({ code: 'PGRST202' });
        await expect(backfillThumbnails([{ id: 'a' }, { id: 'b' }], {
            userId: 'mgr', download: async () => jpeg('A'), shrink: async () => jpeg('t'), attach,
        })).rejects.toThrow('update 0008');
        expect(attach).toHaveBeenCalledTimes(1);
    });
});
