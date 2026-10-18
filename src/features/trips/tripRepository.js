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
