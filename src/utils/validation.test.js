import { describe, it, expect } from 'vitest';
import { validateCoordinates } from './validation';

describe('validateCoordinates', () => {
    it('accepts a point inside South Africa (Johannesburg)', () => {
        expect(validateCoordinates(-26.2041, 28.0473)).toEqual({ isValid: true, error: null, isInverted: false });
    });

    it('accepts numeric strings', () => {
        expect(validateCoordinates('-33.9249', '18.4241').isValid).toBe(true);
    });

    it('flags swapped lat/lng as inverted so the UI can offer a one-click fix', () => {
        const result = validateCoordinates(28.0473, -26.2041);
        expect(result.isValid).toBe(false);
        expect(result.isInverted).toBe(true);
    });

    it('rejects a point outside the region without suggesting a swap', () => {
        const result = validateCoordinates(51.5074, -0.1278); // London
        expect(result.isValid).toBe(false);
        expect(result.isInverted).toBe(false);
        expect(result.error).toMatch(/outside expected region/);
    });

    it('rejects non-numeric input', () => {
        expect(validateCoordinates('abc', 28).error).toBe('Invalid numbers');
    });

    it('treats the bounding box edges as inside', () => {
        expect(validateCoordinates(-35, 16).isValid).toBe(true);
        expect(validateCoordinates(-22, 33).isValid).toBe(true);
    });
});
