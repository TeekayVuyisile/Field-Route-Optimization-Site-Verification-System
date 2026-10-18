// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isLngLat, validateOptimizeBody, validateDirectionsBody } from './validate.js';

const pts = (n) => Array.from({ length: n }, () => [28, -26]);

describe('isLngLat', () => {
    it('accepts in-range pairs', () => expect(isLngLat([28.04, -26.2])).toBe(true));
    it.each([
        [[28]], [[28, -26, 0]], [['28', -26]], [[NaN, -26]], [[181, 0]], [[0, 91]], [null], [{ lng: 28, lat: -26 }]
    ])('rejects %j', (value) => expect(isLngLat(value)).toBe(false));
});

describe('validateOptimizeBody', () => {
    it('accepts a valid body', () => {
        expect(validateOptimizeBody({ start: [28, -26], jobs: pts(70) })).toBeNull();
    });
    it('rejects a missing start', () => expect(validateOptimizeBody({ jobs: pts(1) })).toMatch(/start/));
    it('rejects more than 70 jobs', () => expect(validateOptimizeBody({ start: [28, -26], jobs: pts(71) })).toMatch(/1-70/));
    it('rejects no jobs', () => expect(validateOptimizeBody({ start: [28, -26], jobs: [] })).toMatch(/1-70/));
    it('rejects a null body', () => expect(validateOptimizeBody(null)).not.toBeNull());
});

describe('validateDirectionsBody', () => {
    it('accepts 2-50 points', () => {
        expect(validateDirectionsBody({ coordinates: pts(2) })).toBeNull();
        expect(validateDirectionsBody({ coordinates: pts(50) })).toBeNull();
    });
    it('rejects 1 or 51 points', () => {
        expect(validateDirectionsBody({ coordinates: pts(1) })).not.toBeNull();
        expect(validateDirectionsBody({ coordinates: pts(51) })).not.toBeNull();
    });
});
