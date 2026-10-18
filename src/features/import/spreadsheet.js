import Papa from 'papaparse';
import { parseCoordinate, validateCoordinates } from '../../utils/validation';
import { createLocalId } from '../sites/siteIds';

/**
 * Turning a CSV/Excel file into staged sites: read -> guess columns ->
 * map rows -> validate. Pure apart from readSpreadsheet (file IO).
 */

export const ACCEPTED_FILE_TYPES = '.csv,.txt,.xlsx,.xls';

/**
 * @returns {Promise<{ headers: string[], rows: Object[] }>}
 * Delimiter is auto-detected, so semicolon CSVs from SA Excel work.
 */
export const readSpreadsheet = async (file) => {
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'csv' || extension === 'txt') {
        const { data, meta, errors } = await new Promise((resolve, reject) => {
            Papa.parse(file, { header: true, skipEmptyLines: 'greedy', complete: resolve, error: reject });
        });
        if (!data.length && errors.length) throw new Error(`Couldn't read the CSV: ${errors[0].message}`);
        return { headers: (meta.fields ?? []).filter(Boolean), rows: data };
    }

    if (extension === 'xlsx' || extension === 'xls') {
        // SheetJS is large; only download it when someone actually opens Excel
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer());
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const headers = rows.length ? Object.keys(rows[0]) : [];
        return { headers, rows };
    }

    throw new Error('Unsupported file. Upload a CSV or Excel (.xlsx, .xls) file.');
};

const normalize = (header) => String(header).toLowerCase().replace(/[^a-z]/g, '');

const CANDIDATES = {
    name: ['name', 'sitename', 'site', 'location', 'locationname', 'description', 'title', 'label', 'id', 'siteid'],
    lat: ['latitude', 'lat', 'y', 'gpslat', 'gpslatitude', 'latdd', 'latitudedd'],
    lng: ['longitude', 'lng', 'lon', 'long', 'x', 'gpslng', 'gpslon', 'gpslongitude', 'londd', 'longitudedd'],
};

/**
 * Best-guess column mapping from header names; '' where nothing matches.
 * Exact (normalised) matches beat "contains" matches.
 */
export const guessColumnMapping = (headers) => {
    const used = new Set();
    const pick = (field) => {
        const options = CANDIDATES[field];
        const normalized = headers.map((h) => [h, normalize(h)]);
        for (const option of options) {
            const hit = normalized.find(([h, n]) => n === option && !used.has(h));
            if (hit) { used.add(hit[0]); return hit[0]; }
        }
        if (field !== 'name') {
            const hit = normalized.find(([h, n]) => !used.has(h) && options.slice(0, 2).some((o) => n.includes(o)));
            if (hit) { used.add(hit[0]); return hit[0]; }
        }
        return '';
    };
    // Coordinates first so a "Location" column isn't taken as the name if it holds coordinates
    const lat = pick('lat');
    const lng = pick('lng');
    const name = pick('name');
    return { name, lat, lng };
};

/** Validation fields for a site's current coordinates. */
export const withValidation = (site) => {
    const { isValid, error, isInverted } = validateCoordinates(site.latitude, site.longitude);
    return { ...site, isValid, error, isInverted };
};

export const rowsToSites = (rows, mapping) => rows.map((row, index) => withValidation({
    id: createLocalId(),
    name: String(row[mapping.name] ?? '').trim() || `Site ${index + 1}`,
    latitude: parseCoordinate(row[mapping.lat]),
    longitude: parseCoordinate(row[mapping.lng]),
    // Original cell text, shown when it couldn't be read
    rawLatitude: row[mapping.lat],
    rawLongitude: row[mapping.lng],
    is_checked: false,
    notes: ''
}));

export const swapCoordinates = (site) => withValidation({ ...site, latitude: site.longitude, longitude: site.latitude });

export const isReadable = (site) => Number.isFinite(site.latitude) && Number.isFinite(site.longitude);

export const summarizeSites = (sites) => {
    const unreadable = sites.filter((s) => !isReadable(s)).length;
    const ready = sites.filter((s) => s.isValid).length;
    return { total: sites.length, ready, unreadable, outOfRegion: sites.length - ready - unreadable };
};
