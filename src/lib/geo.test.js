import { describe, it, expect } from 'vitest';
import { calculateDistance } from './geo';

describe('calculateDistance', () => {
    it('is zero for the same point', () => {
        expect(calculateDistance(-26.2, 28.0, -26.2, 28.0)).toBe(0);
    });

    it('matches the known Johannesburg to Pretoria distance (~54 km)', () => {
        const d = calculateDistance(-26.2041, 28.0473, -25.7479, 28.2293);
        expect(d).toBeGreaterThan(53_000);
        expect(d).toBeLessThan(55_000);
    });

    it('is symmetric', () => {
        const a = calculateDistance(-33.92, 18.42, -29.85, 31.02);
        const b = calculateDistance(-29.85, 31.02, -33.92, 18.42);
        expect(a).toBeCloseTo(b, 6);
    });
});
