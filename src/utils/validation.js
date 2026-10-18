/**
 * Validation constants for South Africa
 */
export const SA_BOUNDS = {
    LAT_MIN: -35,
    LAT_MAX: -22,
    LNG_MIN: 16,
    LNG_MAX: 33
};

export const UNREADABLE_ERROR = "Couldn't read coordinates";

const NUMBER_PART = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

/**
 * Strictly parses one coordinate as typed in spreadsheets and by hand.
 * Unlike parseFloat, it never returns a partial read ("-26,2041" -> -26,
 * "26°12'15\"S" -> 26); anything it can't fully understand is NaN.
 *
 * Accepts:
 *  - numbers (Excel numeric cells)
 *  - decimal point or decimal comma: "-26.2041", "-26,2041"
 *  - degrees/minutes/seconds: 26°12'15"S, 26 12 15.5 S, S26°12'15"
 *  - degrees + decimal minutes: 26°12.25'S
 *  - hemisphere letters before or after: S/W make the value negative
 *
 * @param {number|string} value
 * @returns {number} decimal degrees, or NaN
 */
export const parseCoordinate = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value !== 'string') return NaN;

    let s = value.trim().toUpperCase()
        .replace(/[−–—]/g, '-')   // Unicode minus / dashes
        .replace(/[º˚]/g, '°')
        .replace(/[′’‘´`]/g, "'")
        .replace(/[″“”]/g, '"')
        .replace(/''/g, '"');
    if (!s) return NaN;

    let hemisphere = null;
    const leading = s.match(/^([NSEW])\s*(.+)$/);
    const trailing = s.match(/^(.+?)\s*([NSEW])$/);
    if (leading) {
        [, hemisphere, s] = leading;
    } else if (trailing) {
        [, s, hemisphere] = trailing;
    }

    let negative = false;
    if (s.startsWith('-') || s.startsWith('+')) {
        negative = s.startsWith('-');
        s = s.slice(1).trim();
    }

    const parts = s.replace(/[°'":]/g, ' ').trim().split(/\s+/);
    if (parts.length > 3 || !parts.every((p) => NUMBER_PART.test(p))) return NaN;

    const [degrees, minutes = 0, seconds = 0] = parts.map((p) => Number(p.replace(',', '.')));
    // Only the last part may have a fraction: 26°12.5' is fine, 26.5°12' is not
    if (parts.slice(0, -1).some((p) => /[.,]/.test(p))) return NaN;
    if (minutes >= 60 || seconds >= 60) return NaN;

    const result = degrees + minutes / 60 + seconds / 3600;
    return negative || hemisphere === 'S' || hemisphere === 'W' ? -result : result;
};

/** True when a site's coordinates are real numbers (safe to save and route). */
export const hasReadableCoordinates = (site) =>
    Number.isFinite(site.latitude) && Number.isFinite(site.longitude);

/**
 * Validates if coordinates are within South African range
 * @param {number|string} lat
 * @param {number|string} lng
 * @returns {Object} { isValid: boolean, error: string|null, isInverted: boolean }
 */
export const validateCoordinates = (lat, lng) => {
    const latNum = parseCoordinate(lat);
    const lngNum = parseCoordinate(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
        return { isValid: false, error: UNREADABLE_ERROR, isInverted: false };
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
