import { supabase } from '../../lib/supabase';

/**
 * Supabase reads/writes for whole trips. Functions throw on error.
 */

/**
 * Saves a staged trip and its sites atomically (see the
 * create_trip_with_sites migration). Returns the persisted trip and sites
 * with their real database ids.
 */
export const createTripWithSites = async (title, sites) => {
    const { data, error } = await supabase.rpc('create_trip_with_sites', {
        p_title: title,
        p_sites: sites.map(s => ({
            name: s.name,
            latitude: s.latitude,
            longitude: s.longitude,
            notes: s.notes || ''
        }))
    });
    if (error) throw error;
    return { trip: data.trip, sites: data.sites ?? [] };
};

export const fetchTripWithSites = async (tripId) => {
    const [tripResult, sitesResult] = await Promise.all([
        supabase.from('trips').select('*').eq('id', tripId).single(),
        supabase.from('sites').select('*').eq('trip_id', tripId).order('order_index', { ascending: true })
    ]);
    if (tripResult.error) throw tripResult.error;
    if (sitesResult.error) throw sitesResult.error;
    return { trip: tripResult.data, sites: sitesResult.data ?? [] };
};

/**
 * Trips visible to the user (RLS: managers get the whole team, agents their
 * own + assigned), newest first, each with site progress counted by the
 * database in the same request.
 * @returns {Promise<Array>} trips with `siteCount` and `checkedCount`
 */
export const fetchTripsWithProgress = async () => {
    const { data, error } = await supabase
        .from('trips')
        .select('*, site_total:sites(count), site_done:sites(count)')
        .eq('site_done.is_checked', true)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(({ site_total, site_done, ...trip }) => ({
        ...trip,
        siteCount: site_total?.[0]?.count ?? 0,
        checkedCount: site_done?.[0]?.count ?? 0,
    }));
};

export const deleteTrip = async (tripId) => {
    // .select() so an RLS-blocked delete (0 rows) is reported, not silent
    const { data, error } = await supabase.from('trips').delete().eq('id', tripId).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error("You can't delete this trip.");
};

/**
 * Updates trip fields (assignment, status). The guard_trip_write trigger
 * rejects assignments the caller's role doesn't allow.
 */
export const updateTrip = async (tripId, fields) => {
    const { data, error } = await supabase.from('trips').update(fields).eq('id', tripId).select().single();
    if (error) throw error;
    return data;
};

/** Persists the visiting order: siteIds[0] becomes order_index 0. */
export const saveSiteOrder = async (siteIds) => {
    const { error } = await supabase.rpc('set_site_order', { p_site_ids: siteIds });
    if (error) throw error;
};
