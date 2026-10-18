import { describe, it, expect } from 'vitest';
import { assessCheckIn, checkInFields, UNDO_CHECK_IN } from './checkIn';

const site = { latitude: -26, longitude: 28 };

describe('assessCheckIn', () => {
    it('passes a check-in inside the radius', () => {
        const { distance, flagged } = assessCheckIn(site, { lat: -25.9995, lng: 28 }, 150);
        expect(distance).toBeCloseTo(55.6, 0);
        expect(flagged).toBe(false);
    });

    it('flags one beyond the radius, and one with no position', () => {
        expect(assessCheckIn(site, { lat: -25.99, lng: 28 }, 150).flagged).toBe(true);
        expect(assessCheckIn(site, null)).toEqual({ distance: null, flagged: true });
    });

    it('uses the team radius', () => {
        expect(assessCheckIn(site, { lat: -25.99, lng: 28 }, 2000).flagged).toBe(false);
    });
});

describe('checkInFields', () => {
    it('records where, how precisely and when, plus an optional reason', () => {
        const now = new Date('2026-10-18T08:30:00Z');
        expect(checkInFields({ lat: -26, lng: 28, accuracy: 12.7 }, '  Gate locked ', now)).toEqual({
            is_checked: true,
            checked_at: '2026-10-18T08:30:00.000Z',
            check_lat: -26,
            check_lng: 28,
            check_accuracy_m: 13,
            check_note: 'Gate locked',
        });
    });

    it('still checks in without a position (the database flags it)', () => {
        expect(checkInFields(null, '')).toMatchObject({ is_checked: true, check_lat: null, check_accuracy_m: null, check_note: null });
    });

    it('undo clears what a check-in sent', () => {
        expect(Object.keys(UNDO_CHECK_IN).sort()).toEqual(Object.keys(checkInFields(null)).sort());
    });
});
