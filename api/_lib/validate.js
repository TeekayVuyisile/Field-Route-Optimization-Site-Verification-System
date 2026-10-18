// Request validation for the ORS proxy. The proxy builds the ORS request
// itself from these validated values, so callers can't use our key for
// arbitrary ORS endpoints or oversized jobs.

export const ORS_MAX_JOBS = 70;
export const ORS_MAX_WAYPOINTS = 50;

/** [lng, lat] with finite, in-range numbers */
export const isLngLat = (value) =>
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(Number.isFinite) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90;

const isLngLatList = (value, min, max) =>
    Array.isArray(value) && value.length >= min && value.length <= max && value.every(isLngLat);

/** Returns an error message, or null when the optimize body is valid. */
export const validateOptimizeBody = (body) => {
    if (!body || !isLngLat(body.start)) return 'start must be [lng, lat]';
    if (!isLngLatList(body.jobs, 1, ORS_MAX_JOBS)) {
        return `jobs must be 1-${ORS_MAX_JOBS} [lng, lat] pairs`;
    }
    return null;
};

/** Returns an error message, or null when the directions body is valid. */
export const validateDirectionsBody = (body) => {
    if (!body || !isLngLatList(body.coordinates, 2, ORS_MAX_WAYPOINTS)) {
        return `coordinates must be 2-${ORS_MAX_WAYPOINTS} [lng, lat] pairs`;
    }
    return null;
};
