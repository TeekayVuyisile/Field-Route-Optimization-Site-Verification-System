// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import TripReportDocument from './TripReportDocument';
import { pickReportPhotos } from './reportData';
import { summarizeReport } from '../trips/tripReport';

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const checklist = { name: 'WiFi audit', items: [
    { id: 'power', label: 'Power on', type: 'check', required: true },
    { id: 'ssid', label: 'SSID seen', type: 'text', required: true },
] };

const makeSites = (n) => Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, name: `Site ${i + 1} – Sandton “tower”`, latitude: -26.1 - i * 0.001, longitude: 28.05,
    is_checked: i % 2 === 0, checked_at: '2026-10-18T09:42:00Z', check_distance_m: i === 0 ? 1240 : 30,
    check_flagged: i === 0, check_note: i === 0 ? 'Pin is at the gate' : null,
    notes: i === 1 ? 'Gate code 1234. Ask for Thabo at reception; café on the ground floor.' : '',
    checklist_answers: i % 2 === 0 ? { power: true, ssid: 'City-WiFi' } : { power: true },
}));

const render = async ({ sites, photos = [], images = new Map(), withChecklist = true }) => {
    const photosBySite = new Map();
    for (const p of photos) photosBySite.set(p.site_id, [...(photosBySite.get(p.site_id) ?? []), p]);
    const doc = createElement(TripReportDocument, {
        trip: { id: 't1', title: 'Sandton WiFi audit, week 43', status: 'in_progress', created_at: '2026-10-12', checklist: withChecklist ? checklist : null },
        sites, summary: summarizeReport(sites, photos), photosBySite, images,
        reportPhotos: pickReportPhotos(photos), generatedAt: new Date('2026-10-18T10:00:00Z'),
    });
    return streamToBuffer(await pdf(doc).toBuffer());
};

const streamToBuffer = (stream) => new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
});

const pageCount = (buffer) => (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('TripReportDocument', () => {
    vi.setConfig({ testTimeout: 30000 });

    it('renders a valid PDF with a summary and every site', async () => {
        const buffer = await render({ sites: makeSites(3) });
        expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
        expect(pageCount(buffer)).toBe(1);
    });

    it('flows a long trip onto more pages', async () => {
        const buffer = await render({ sites: makeSites(40) });
        expect(pageCount(buffer)).toBeGreaterThan(3);
    });

    it('embeds photos and copes with sites that have none or no checklist', async () => {
        const photos = [{ id: 'p1', site_id: 's0' }, { id: 'p2', site_id: 's0' }];
        const withPhotos = await render({ sites: makeSites(2), photos, images: new Map([['p1', PNG]]), withChecklist: false });
        const without = await render({ sites: makeSites(2), photos: [], withChecklist: false });
        expect(withPhotos.toString('latin1')).toMatch(/\/Subtype \/Image/);
        expect(without.toString('latin1')).not.toMatch(/\/Subtype \/Image/);
    });
});
