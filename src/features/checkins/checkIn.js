import { calculateDistance } from '../../lib/geo';

export const DEFAULT_CHECKIN_RADIUS_M = 150;
// Same bounds as the organizations.checkin_radius_m check (migration 0006)
export const CHECKIN_RADIUS_LIMITS = { min: 25, max: 5000 };

/**
 * What the database will decide about a check-in from here (migration 0006
 * computes the real verdict; this lets the app warn first).
 * @param {{ lat, lng, accuracy? } | null} pos
 * @returns {{ distance: number | null, flagged: boolean }}
 */
export const assessCheckIn = (site, pos, radius = DEFAULT_CHECKIN_RADIUS_M) => {
    if (!pos) return { distance: null, flagged: true };
    const distance = calculateDistance(site.latitude, site.longitude, pos.lat, pos.lng);
    return { distance, flagged: distance > radius };
};

/**
 * Fields sent for a check-in. checked_at is the phone's time, so a check-in
 * made offline keeps its real time when it syncs later.
 */
export const checkInFields = (pos, note, now = new Date()) => ({
    is_checked: true,
    checked_at: now.toISOString(),
    check_lat: pos?.lat ?? null,
    check_lng: pos?.lng ?? null,
    check_accuracy_m: Number.isFinite(pos?.accuracy) ? Math.round(pos.accuracy) : null,
    check_note: note?.trim() || null,
});

/** Undoing a check-in (the database clears the rest itself) */
export const UNDO_CHECK_IN = {
    is_checked: false,
    checked_at: null,
    check_lat: null,
    check_lng: null,
    check_accuracy_m: null,
    check_note: null,
};
