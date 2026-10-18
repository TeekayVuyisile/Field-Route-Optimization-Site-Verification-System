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

/**
 * Upload a photo to the `site-photos` bucket and record it in `site_images`.
 * The path MUST start with the user's id: storage RLS policies key off the
 * first path segment matching auth.uid().
 */
export const uploadSitePhoto = async ({ userId, siteId, file }) => {
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/${siteId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from('site-photos')
        .upload(filePath, file);
    if (uploadError) throw uploadError;

    // user_id must be explicit to satisfy the site_images RLS policy
    const { error: dbError } = await supabase
        .from('site_images')
        .insert([{
            site_id: siteId,
            user_id: userId,
            storage_path: filePath,
            file_name: file.name
        }]);
    if (dbError) throw dbError;

    return filePath;
};
