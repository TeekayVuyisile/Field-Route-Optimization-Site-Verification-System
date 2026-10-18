import { describe, it, expect } from 'vitest';
import { buildTripCsv, csvText, fileSlug, summarizeReport } from './tripReport';

const sites = [
    { id: 's1', name: 'Tower "North"', is_checked: true, notes: 'Gate code 1234', latitude: -26.2041, longitude: 28.0473,
      checked_at: '2026-10-18T08:30:00+00:00', check_distance_m: 412.6, check_flagged: true, check_note: 'Pin at the gate' },
    { id: 's2', name: '=HYPERLINK("http://x")', is_checked: false, notes: null, latitude: -26.3, longitude: 28.1 },
];
const photos = [{ site_id: 's1' }, { site_id: 's1' }];

describe('summarizeReport', () => {
    it('counts visited, remaining and photos', () => {
        expect(summarizeReport(sites, photos)).toEqual({ total: 2, visited: 1, flagged: 1, remaining: 1, photoCount: 2, percent: 50 });
    });

    it('is 0% for an empty trip rather than NaN', () => {
        expect(summarizeReport([], []).percent).toBe(0);
    });
});

describe('csvText', () => {
    it('doubles quotes inside the cell', () => {
        expect(csvText('Tower "North"')).toBe('"Tower ""North"""');
    });

    it('defuses text that a spreadsheet would run as a formula', () => {
        expect(csvText('=1+1')).toBe(`"'=1+1"`);
        expect(csvText('-cmd')).toBe(`"'-cmd"`);
        expect(csvText(null)).toBe('""');
    });
});

describe('buildTripCsv', () => {
    it('writes one row per site in visiting order with photo counts', () => {
        const lines = buildTripCsv(sites, photos).split('\r\n');
        expect(lines[0]).toBe('\uFEFFStop,Site name,Status,Notes,Latitude,Longitude,Photos,Checked in at,Distance from site (m),Flagged,Check-in reason');
        expect(lines[1]).toBe('1,"Tower ""North""","Visited","Gate code 1234",-26.2041,28.0473,2,2026-10-18T08:30:00+00:00,413,"Yes","Pin at the gate"');
        // Negative coordinates stay numbers; only text cells are defused
        expect(lines[2]).toBe(`2,"'=HYPERLINK(""http://x"")","Not visited","",-26.3,28.1,0,,,"",""`);
    });
});

describe('buildTripCsv with a checklist', () => {
    it('adds one column per item with readable answers', () => {
        const checklist = { name: 'Audit', items: [
            { id: 'power', label: 'Power on', type: 'check' },
            { id: 'pic', label: 'Router photo', type: 'photo' },
        ] };
        const withAnswers = [{ ...sites[0], checklist_answers: { power: true } }, sites[1]];
        const lines = buildTripCsv(withAnswers, photos, checklist).split(String.fromCharCode(13, 10));
        expect(lines[0].endsWith('Check-in reason,"Power on","Router photo"')).toBe(true);
        expect(lines[1].endsWith('"Yes","2 photos"')).toBe(true);
        expect(lines[2].endsWith('"",""')).toBe(true);
    });
});

describe('fileSlug', () => {
    it('keeps letters and numbers, including accented ones', () => {
        expect(fileSlug('Soweto run, week 43')).toBe('Soweto-run-week-43');
        expect(fileSlug('Café / Ga-Rankuwa')).toBe('Café-Ga-Rankuwa');
        expect(fileSlug('***')).toBe('trip');
    });
});
