/**
 * Validation constants for South Africa
 */
export const SA_BOUNDS = {
    LAT_MIN: -35,
    LAT_MAX: -22,
    LNG_MIN: 16,
    LNG_MAX: 33
};

/**
 * Validates if coordinates are within South African range
 * @param {number} lat 
 * @param {number} lng 
 * @returns {Object} { isValid: boolean, error: string|null, isInverted: boolean }
 */
export const validateCoordinates = (lat, lng) => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
        return { isValid: false, error: 'Invalid numbers', isInverted: false };
    }

    // Check for inversion: Is the latitude in the longitude range and vice versa?
    const possibleInversion = (
        latNum >= SA_BOUNDS.LNG_MIN && latNum <= SA_BOUNDS.LNG_MAX &&
        lngNum >= SA_BOUNDS.LAT_MIN && lngNum <= SA_BOUNDS.LAT_MAX
    );

    const inRange = (
        latNum >= SA_BOUNDS.LAT_MIN && latNum <= SA_BOUNDS.LAT_MAX &&
        lngNum >= SA_BOUNDS.LNG_MIN && lngNum <= SA_BOUNDS.LNG_MAX
    );

    if (!inRange && possibleInversion) {
        return { isValid: false, error: 'Coordinates may be inverted', isInverted: true };
    }

    if (!inRange) {
        return { isValid: false, error: 'Coordinate outside expected region (South Africa)', isInverted: false };
    }

    return { isValid: true, error: null, isInverted: false };
};
