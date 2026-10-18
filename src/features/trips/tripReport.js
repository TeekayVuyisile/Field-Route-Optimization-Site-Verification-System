/** Completion numbers for a trip report. */
export const summarizeReport = (sites, photos) => {
    const visited = sites.filter((s) => s.is_checked).length;
    return {
        total: sites.length,
        visited,
        flagged: sites.filter((s) => s.is_checked && s.check_flagged).length,
        remaining: sites.length - visited,
        photoCount: photos.length,
        percent: sites.length ? Math.round((visited / sites.length) * 100) : 0,
    };
};

/**
 * One CSV text cell. Quotes are doubled (a note containing `"` used to break
 * the row), and text starting with = + - @ is prefixed with ' so Excel
 * doesn't run it as a formula (CSV injection via a site name or note).
 */
export const csvText = (value) => {
    const text = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
};

const CSV_HEADERS = [
    'Stop', 'Site name', 'Status', 'Notes', 'Latitude', 'Longitude', 'Photos',
    'Checked in at', 'Distance from site (m)', 'Flagged', 'Check-in reason',
];

/**
 * The verification log as CSV, in visiting order. Starts with a byte-order
 * mark so Excel reads accented names as UTF-8; coordinates stay numbers.
 */
export const buildTripCsv = (sites, photos) => {
    const photoCounts = new Map();
    for (const photo of photos) photoCounts.set(photo.site_id, (photoCounts.get(photo.site_id) ?? 0) + 1);

    const rows = sites.map((site, index) => [
        index + 1,
        csvText(site.name),
        csvText(site.is_checked ? 'Visited' : 'Not visited'),
        csvText(site.notes),
        site.latitude,
        site.longitude,
        photoCounts.get(site.id) ?? 0,
        // ISO 8601 with offset: unambiguous, and Excel/Sheets parse it
        site.checked_at ?? '',
        site.check_distance_m == null ? '' : Math.round(site.check_distance_m),
        csvText(site.is_checked ? (site.check_flagged ? 'Yes' : 'No') : ''),
        csvText(site.check_note),
    ].join(','));

    return `\uFEFF${[CSV_HEADERS.join(','), ...rows].join('\r\n')}\r\n`;
};

/** Safe file name for downloads: "Soweto run, week 43" -> "Soweto-run-week-43" */
export const fileSlug = (title) =>
    String(title ?? '').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'trip';
