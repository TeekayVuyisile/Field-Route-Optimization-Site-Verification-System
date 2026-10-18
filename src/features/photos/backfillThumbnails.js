import { attachThumbnail, downloadSitePhoto } from '../sites/siteRepository';
import { compressImage } from './compressImage';

/**
 * Makes thumbnails for photos taken before thumbnails existed, one at a time
 * (each original can be several MB). A photo that fails is skipped; a
 * missing database function (migration 0008 not applied) stops the run.
 * @returns {Promise<{ made: number, skipped: number }>}
 */
export const backfillThumbnails = async (photos, {
    userId,
    onProgress = () => {},
    download = downloadSitePhoto,
    shrink = (blob) => compressImage(blob, { maxSize: 320, quality: 0.7 }),
    attach = attachThumbnail,
} = {}) => {
    let made = 0;
    let skipped = 0;
    for (const [index, photo] of photos.entries()) {
        try {
            const original = await download(photo);
            const thumb = await shrink(original);
            // compressImage hands back the original when it can't decode it
            if (thumb === original || thumb.type !== 'image/jpeg') {
                skipped += 1;
            } else if (await attach({ photoId: photo.id, userId, blob: thumb })) {
                made += 1;
            } else {
                skipped += 1;
            }
        } catch (error) {
            if (error?.code === 'PGRST202') {
                throw new Error('The database needs update 0008 before thumbnails can be made.', { cause: error });
            }
            console.warn(`No thumbnail for photo ${photo.id}:`, error);
            skipped += 1;
        }
        onProgress(index + 1, photos.length);
    }
    return { made, skipped };
};
