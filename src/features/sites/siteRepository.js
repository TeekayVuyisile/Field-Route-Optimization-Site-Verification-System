import { supabase } from '../../lib/supabase';

/**
 * All Supabase reads/writes for sites and their photos. Pages call these
 * instead of building queries inline. Functions throw on error.
 */

export const updateSite = async (siteId, updates) => {
    const { error } = await supabase.from('sites').update(updates).eq('id', siteId);
    if (error) throw error;
};

export const deleteSite = async (siteId) => {
    const { error } = await supabase.from('sites').delete().eq('id', siteId);
    if (error) throw error;
};

export const insertSite = async (tripId, site, orderIndex) => {
    const { data, error } = await supabase.from('sites').insert([{
        trip_id: tripId,
        name: site.name,
        latitude: site.latitude,
        longitude: site.longitude,
        order_index: orderIndex,
        is_checked: false
    }]).select().single();
    if (error) throw error;
    return data;
};

const PHOTO_URL_TTL_SECONDS = 60 * 60;

/**
 * Temporary signed URLs for photos, in one request. Works whether the bucket
 * is public or private (storage RLS still decides who may sign which path),
 * so the bucket can be made private without breaking the review page.
 * @param {string[]} storagePaths
 * @returns {Promise<Map<string, string>>} storage_path -> signed URL
 */
export const getSignedPhotoUrls = async (storagePaths) => {
    if (storagePaths.length === 0) return new Map();

    const { data, error } = await supabase.storage
        .from('site-photos')
        .createSignedUrls(storagePaths, PHOTO_URL_TTL_SECONDS);
    if (error) throw error;

    return new Map(
        data.filter((entry) => entry.signedUrl && !entry.error).map((entry) => [entry.path, entry.signedUrl])
    );
};

const fileExtension = (file, fileName) =>
    (file.type === 'image/jpeg' ? 'jpg' : (fileName ?? file.name ?? '').split('.').pop() || 'jpg').toLowerCase();

// Storage answers a second upload to the same path with 409 Duplicate
const isAlreadyStored = (error) => String(error?.statusCode) === '409' || /already exists|duplicate/i.test(error?.message ?? '');

/**
 * Upload a photo to the `site-photos` bucket and record it in `site_images`.
 * Safe to run again with the same `id` (the outbox retries after a lost
 * response): the file path comes from the id, an existing file is accepted
 * and the record is only inserted once.
 * The path MUST start with the user's id: storage RLS policies key off the
 * first path segment matching auth.uid().
 */
export const uploadSitePhoto = async ({ id, userId, siteId, file, thumb, fileName, takenAt, takenLat, takenLng }) => {
    const folder = `${userId}/${siteId}`;
    const filePath = `${folder}/${id}.${fileExtension(file, fileName)}`;
    // Small copy for lists; absent when the phone couldn't decode the photo
    const thumbPath = thumb ? `${folder}/${id}_thumb.jpg` : null;

    const upload = async (path, blob) => {
        const { error } = await supabase.storage
            .from('site-photos')
            .upload(path, blob, { contentType: blob.type || 'image/jpeg' });
        if (error && !isAlreadyStored(error)) throw error;
    };
    await upload(filePath, file);
    if (thumb) await upload(thumbPath, thumb);

    const { data: existing, error: lookupError } = await supabase
        .from('site_images')
        .select('id')
        .eq('storage_path', filePath)
        .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return filePath;

    // user_id must be explicit to satisfy the site_images RLS policy
    const { error: dbError } = await supabase
        .from('site_images')
        .insert([{
            site_id: siteId,
            user_id: userId,
            storage_path: filePath,
            thumb_path: thumbPath,
            file_name: fileName ?? file.name ?? `${id}.jpg`,
            taken_at: takenAt ?? null,
            taken_lat: takenLat ?? null,
            taken_lng: takenLng ?? null,
        }]);
    if (dbError) throw dbError;

    return filePath;
};

/**
 * Photo records for these sites, oldest first, each with signed `url` and
 * `thumbUrl` (the original when there's no thumbnail).
 * If signing fails the records still come back (url null) with
 * `urlsFailed`, so a report can show the rest of its data.
 * @returns {Promise<{ photos: Array, urlsFailed: boolean }>}
 */
export const fetchSitePhotos = async (siteIds) => {
    if (siteIds.length === 0) return { photos: [], urlsFailed: false };

    const { data, error } = await supabase
        .from('site_images')
        .select('*')
        .in('site_id', siteIds)
        .order('created_at', { ascending: true });
    if (error) throw error;

    let urls = new Map();
    let urlsFailed = false;
    try {
        // Photos and thumbnails in one request
        urls = await getSignedPhotoUrls(data.flatMap((photo) => [photo.storage_path, photo.thumb_path].filter(Boolean)));
    } catch (urlError) {
        console.error('Could not sign photo URLs:', urlError);
        urlsFailed = true;
    }
    return {
        photos: data.map((photo) => {
            const url = urls.get(photo.storage_path) ?? null;
            // Photos from before thumbnails existed fall back to the original
            return { ...photo, url, thumbUrl: (photo.thumb_path && urls.get(photo.thumb_path)) || url };
        }),
        urlsFailed,
    };
};

/**
 * Files (photo and thumbnail) first, then the record. Order matters: the storage policy that lets a
 * manager delete a teammate's photo looks the file up in `site_images`, so
 * the record must still exist when the file goes. Both policies allow the
 * same people (uploader or team manager).
 */
export const deleteSitePhoto = async (photo) => {
    const paths = [photo.storage_path, photo.thumb_path].filter(Boolean);
    const { error: storageError } = await supabase.storage.from('site-photos').remove(paths);
    if (storageError) throw storageError;

    const { error: dbError } = await supabase.from('site_images').delete().eq('id', photo.id);
    if (dbError) throw dbError;
};

/** The original file, for "Download" */
export const downloadSitePhoto = async (photo) => {
    const { data, error } = await supabase.storage.from('site-photos').download(photo.storage_path);
    if (error) throw error;
    return data;
};
