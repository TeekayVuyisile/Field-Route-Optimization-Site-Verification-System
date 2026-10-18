import { describe, it, expect } from 'vitest';
import { guessColumnMapping, rowsToSites, swapCoordinates, summarizeSites, readSpreadsheet } from './spreadsheet';

describe('guessColumnMapping', () => {
    it.each([
        [['Site Name', 'Latitude', 'Longitude'], { name: 'Site Name', lat: 'Latitude', lng: 'Longitude' }],
        [['name', 'lat', 'lng'], { name: 'name', lat: 'lat', lng: 'lng' }],
        [['Tower', 'Y', 'X'], { name: '', lat: 'Y', lng: 'X' }],
        [['ID', 'GPS Lat', 'GPS Lon', 'Notes'], { name: 'ID', lat: 'GPS Lat', lng: 'GPS Lon' }],
        [['Location', 'Latitude (DD)', 'Longitude (DD)'], { name: 'Location', lat: 'Latitude (DD)', lng: 'Longitude (DD)' }],
        [['site', 'LONG', 'LAT'], { name: 'site', lat: 'LAT', lng: 'LONG' }],
    ])('maps %j', (headers, expected) => {
        expect(guessColumnMapping(headers)).toEqual(expected);
    });

    it('never maps one column to two fields', () => {
        const m = guessColumnMapping(['lat', 'other']);
        expect(m.lat).toBe('lat');
        expect(m.lng).not.toBe('lat');
    });
});

describe('rowsToSites', () => {
    const mapping = { name: 'Site', lat: 'Lat', lng: 'Lng' };

    it('parses SA formats and validates each row', () => {
        const [a, b, c] = rowsToSites([
            { Site: 'Tower 1', Lat: '-26,2041', Lng: '28,0473' },
            { Site: '', Lat: `26°12'15"S`, Lng: `28°02'50"E` },
            { Site: 'Bad', Lat: 'oops', Lng: '28' },
        ], mapping);

        expect(a).toMatchObject({ name: 'Tower 1', latitude: -26.2041, longitude: 28.0473, isValid: true });
        expect(a.id).toMatch(/^local-/);
        expect(b.name).toBe('Site 2');
        expect(b.isValid).toBe(true);
        expect(c).toMatchObject({ isValid: false, rawLatitude: 'oops' });
        expect(Number.isNaN(c.latitude)).toBe(true);
    });
});

describe('swapCoordinates', () => {
    it('fixes an inverted row and revalidates it', () => {
        const [inverted] = rowsToSites([{ n: 'x', a: '28.0473', b: '-26.2041' }], { name: 'n', lat: 'a', lng: 'b' });
        expect(inverted.isInverted).toBe(true);
        const fixed = swapCoordinates(inverted);
        expect(fixed).toMatchObject({ latitude: -26.2041, longitude: 28.0473, isValid: true, isInverted: false });
    });
});

describe('summarizeSites', () => {
    it('counts ready, outside-SA and unreadable sites', () => {
        const sites = rowsToSites([
            { n: 'ok', a: '-26', b: '28' },
            { n: 'london', a: '51.5', b: '-0.12' },
            { n: 'bad', a: '?', b: '28' },
        ], { name: 'n', lat: 'a', lng: 'b' });
        expect(summarizeSites(sites)).toEqual({ total: 3, ready: 1, outOfRegion: 1, unreadable: 1 });
    });
});

describe('readSpreadsheet', () => {
    it('reads a real Excel workbook (SheetJS 0.20.x)', async () => {
        const XLSX = await import('xlsx');
        const sheet = XLSX.utils.aoa_to_sheet([['Site Name', 'Latitude', 'Longitude'], ['Tower', -26.2041, 28.0473], ['Café kiosk', '-26,3', '28,1']]);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Sites');
        const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
        const file = new File([bytes], 'sites.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const { headers, rows } = await readSpreadsheet(file);
        expect(headers).toEqual(['Site Name', 'Latitude', 'Longitude']);
        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({ 'Site Name': 'Café kiosk', Latitude: '-26,3' });
    });

    it('reads a semicolon CSV (SA Excel export) with headers', async () => {
        const file = new File(['Site;Lat;Lng\nTower 1;-26,2041;28,0473\n'], 'sites.csv', { type: 'text/csv' });
        const { headers, rows } = await readSpreadsheet(file);
        expect(headers).toEqual(['Site', 'Lat', 'Lng']);
        expect(rows).toEqual([{ Site: 'Tower 1', Lat: '-26,2041', Lng: '28,0473' }]);
    });

    it('rejects other file types with a clear message', async () => {
        await expect(readSpreadsheet(new File(['x'], 'sites.pdf'))).rejects.toThrow('Upload a CSV or Excel');
    });
});
