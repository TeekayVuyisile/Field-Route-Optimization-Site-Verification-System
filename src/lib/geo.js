/**
 * Shared geodesy helpers. Single source of truth for distance maths so the
 * guidance engine and the route optimizer can never disagree.
 */

const EARTH_RADIUS_M = 6371e3;

/**
 * Great-circle distance between two points in meters (Haversine formula)
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_M * c;
};
