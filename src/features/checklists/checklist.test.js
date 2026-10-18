import { describe, it, expect } from 'vitest';
import { checklistProgress, cleanTemplate, formatAnswer, isAnswered, missingRequired, newItem, templateProblem } from './checklist';

const checklist = {
    name: 'WiFi audit',
    items: [
        { id: 'power', label: 'Power on', type: 'check', required: true },
        { id: 'ssid', label: 'SSID seen', type: 'text', required: true },
        { id: 'speed', label: 'Speed (Mbps)', type: 'number', required: false },
        { id: 'pic', label: 'Photo of the router', type: 'photo', required: true },
    ],
};

describe('isAnswered', () => {
    it('matches the database rules (a blank or wrong-typed answer does not count)', () => {
        expect(isAnswered(checklist.items[0], true)).toBe(true);
        expect(isAnswered(checklist.items[0], false)).toBe(false);
        expect(isAnswered(checklist.items[1], '   ')).toBe(false);
        expect(isAnswered(checklist.items[2], 0)).toBe(true);
        expect(isAnswered(checklist.items[2], '42')).toBe(false);
    });

    it('counts a photo item as done once the site has a photo (queued or uploaded)', () => {
        expect(isAnswered(checklist.items[3], undefined, 0)).toBe(false);
        expect(isAnswered(checklist.items[3], undefined, 1)).toBe(true);
    });
});

describe('missingRequired / checklistProgress', () => {
    it('lists the required items still open, ignoring optional ones', () => {
        expect(missingRequired(checklist, { power: true }, 0).map((i) => i.id)).toEqual(['ssid', 'pic']);
        expect(missingRequired(checklist, { power: true, ssid: 'City' }, 2)).toEqual([]);
    });

    it('treats a trip without a checklist as complete', () => {
        expect(missingRequired(null)).toEqual([]);
        expect(checklistProgress(null)).toEqual({ done: 0, total: 0 });
    });

    it('counts answered items of all kinds', () => {
        expect(checklistProgress(checklist, { power: true, speed: 12 }, 1)).toEqual({ done: 3, total: 4 });
    });
});

describe('templates', () => {
    it('drops blank items and trims labels before saving', () => {
        const items = [{ ...newItem(), label: '  Gate locked? ' }, { ...newItem(), label: '   ' }];
        expect(cleanTemplate({ name: ' Audit ', items })).toEqual({ name: 'Audit', items: [expect.objectContaining({ label: 'Gate locked?' })] });
    });

    it('explains what is missing', () => {
        expect(templateProblem({ name: '', items: [] })).toMatch(/name/);
        expect(templateProblem({ name: 'Audit', items: [{ ...newItem(), label: '' }] })).toMatch(/at least one item/);
        expect(templateProblem({ name: 'Audit', items: [{ ...newItem(), label: 'x' }] })).toBeNull();
    });

    it('gives new items distinct ids', () => {
        expect(newItem().id).not.toBe(newItem().id);
    });
});

describe('formatAnswer', () => {
    it('reads well in a report', () => {
        expect(formatAnswer(checklist.items[0], true)).toBe('Yes');
        expect(formatAnswer(checklist.items[0], false)).toBe('No');
        expect(formatAnswer(checklist.items[0], undefined)).toBe('');
        expect(formatAnswer(checklist.items[2], 42.5)).toBe('42.5');
        expect(formatAnswer(checklist.items[3], undefined, 2)).toBe('2 photos');
    });
});
