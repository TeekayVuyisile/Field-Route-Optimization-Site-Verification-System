import { describe, it, expect } from 'vitest';
import { validateCoordinates, parseCoordinate } from './validation';

describe('parseCoordinate', () => {
    it.each([
        // [input, expected decimal degrees]
        [-26.2041, -26.2041],
        ['-26.2041', -26.2041],
        ['  28.0473 ', 28.0473],
        ['+28.0473', 28.0473],
        // Regression: parseFloat("-26,2041") is -26 (~22 km off)
        ['-26,2041', -26.2041],
        ['28,0473', 28.0473],
        ['−26.2041', -26.2041],         // Unicode minus from Word/Excel
        ['26.2041S', -26.2041],
        ['S 26.2041', -26.2041],
        ['28.0473 E', 28.0473],
        // Regression: parseFloat(`26°12'15"S`) is +26 (wrong hemisphere)
        [`26°12'15"S`, -(26 + 12 / 60 + 15 / 3600)],
        [`S26°12'15"`, -(26 + 12 / 60 + 15 / 3600)],
        [`26° 12' 15.5" S`, -(26 + 12 / 60 + 15.5 / 3600)],
        [`26º12′15″S`, -(26 + 12 / 60 + 15 / 3600)],  // typographic symbols
        [`26°12'15''S`, -(26 + 12 / 60 + 15 / 3600)],  // two apostrophes as seconds
        ['26 12 15 S', -(26 + 12 / 60 + 15 / 3600)],
        [`-26°12'15"`, -(26 + 12 / 60 + 15 / 3600)],
        [`26°12.25'S`, -(26 + 12.25 / 60)],
        ['26:12:15 S', -(26 + 12 / 60 + 15 / 3600)],
        [`28°2'50"W`, -(28 + 2 / 60 + 50 / 3600)],
        [`26°12,5'S`, -(26 + 12.5 / 60)],
        ['26', 26],
    ])('reads %j', (input, expected) => {
        expect(parseCoordinate(input)).toBeCloseTo(expected, 9);
    });

    it.each([
        [''], ['   '], ['abc'], ['S'], ['26abc'], ['-26.2 abc'], ['26.5°12\''],
        [`26°75'S`], [`26°12'60"S`], ['1,2,3'], ['26.2.1'], ['1 2 3 4'],
        [null], [undefined], [NaN], [Infinity], [{}],
    ])('rejects %j', (input) => {
        expect(parseCoordinate(input)).toBeNaN();
    });
});

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
        expect(validateCoordinates('abc', 28).error).toBe("Couldn't read coordinates");
    });

    it('validates decimal-comma and DMS input', () => {
        expect(validateCoordinates('-26,2041', '28,0473').isValid).toBe(true);
        expect(validateCoordinates(`26°12'15"S`, `28°02'50"E`).isValid).toBe(true);
    });

    // Regression: parseFloat read "-26 12 15" as -26 and called it valid
    it('rejects partially readable values instead of truncating them', () => {
        expect(validateCoordinates('-26.2 abc', 28).isValid).toBe(false);
    });

    it('treats the bounding box edges as inside', () => {
        expect(validateCoordinates(-35, 16).isValid).toBe(true);
        expect(validateCoordinates(-22, 33).isValid).toBe(true);
    });
});
