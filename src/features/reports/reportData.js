import dayjs from 'dayjs';
import { formatDistance } from '../../lib/format';
import { compressImage } from '../photos/compressImage';

/** Thumbnails per site in the PDF: enough evidence, without a 50 MB file */
export const PHOTOS_PER_SITE = 4;

/** The photos that go in the report: the first few of each site, in order */
export const pickReportPhotos = (photos, perSite = PHOTOS_PER_SITE) => {
    const bySite = new Map();
    for (const photo of photos) {
        const list = bySite.get(photo.site_id) ?? [];
        if (list.length < perSite) bySite.set(photo.site_id, [...list, photo]);
    }
    return bySite;
};

/** "Checked in 18 Oct 2026, 09:42 · 34 m from the site", or null if not visited */
export const checkInText = (site) => {
    if (!site.is_checked) return null;
    const parts = [site.checked_at ? `Checked in ${dayjs(site.checked_at).format('D MMM YYYY, HH:mm')}` : 'Checked in'];
    if (site.check_distance_m != null) parts.push(`${formatDistance(site.check_distance_m)} from the site`);
    else if (site.check_flagged && site.checked_at) parts.push('no location');
    return parts.join(' · ');
};

const toDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
});

/**
 * Downloads and shrinks the report's photos to small JPEG data URLs (the
 * PDF library embeds JPEG/PNG only). Photos that fail (offline, deleted,
 * an unsupported format) are left out rather than failing the report.
 * @returns {Promise<Map<string, string>>} photo id -> data URL
 */
export const preparePhotos = async (photos, {
    onProgress = () => {},
    load = (url) => fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))),
    shrink = (blob) => compressImage(blob, { maxSize: 480, quality: 0.75 }),
    batchSize = 4,
} = {}) => {
    const images = new Map();
    let done = 0;
    for (let i = 0; i < photos.length; i += batchSize) {
        await Promise.all(photos.slice(i, i + batchSize).map(async (photo) => {
            try {
                const url = photo.thumbUrl ?? photo.url;
                if (!url) return;
                const blob = await shrink(await load(url));
                if (!['image/jpeg', 'image/png'].includes(blob.type)) return;
                images.set(photo.id, await toDataUrl(blob));
            } catch (error) {
                console.warn(`Photo ${photo.id} left out of the PDF:`, error);
            } finally {
                done += 1;
                onProgress(done, photos.length);
            }
        }));
    }
    return images;
};
