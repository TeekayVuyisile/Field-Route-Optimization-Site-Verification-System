import { describe, it, expect } from 'vitest';
import { shouldAcceptFix } from './gpsFilter';

const base = { lat: -26.0, lng: 28.0 };
// 0.0001° of latitude ≈ 11 m
const north = (meters) => ({ lat: base.lat + meters / 111_000, lng: base.lng });

describe('shouldAcceptFix', () => {
    it('accepts the first fix when accuracy is acceptable', () => {
        expect(shouldAcceptFix(null, base, 50)).toBe(true);
    });

    it('accepts WiFi-grade accuracy up to 300 m', () => {
        expect(shouldAcceptFix(null, base, 300)).toBe(true);
        expect(shouldAcceptFix(null, base, 301)).toBe(false);
    });

    it('ignores sub-5 m jitter', () => {
        expect(shouldAcceptFix(base, north(3), 10)).toBe(false);
    });

    it('accepts normal movement', () => {
        expect(shouldAcceptFix(base, north(40), 10)).toBe(true);
    });

    it('rejects teleport jumps over 500 m', () => {
        expect(shouldAcceptFix(base, north(800), 10)).toBe(false);
    });
});
