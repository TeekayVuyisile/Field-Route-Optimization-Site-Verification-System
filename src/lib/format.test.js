import { describe, it, expect } from 'vitest';
import { countLabel, formatDistance } from './format';

describe('countLabel', () => {
    it('uses the singular only for exactly one', () => {
        expect(countLabel(1, 'site')).toBe('1 site');
        expect(countLabel(0, 'site')).toBe('0 sites');
        expect(countLabel(12, 'site')).toBe('12 sites');
    });

    it('accepts an irregular plural', () => {
        expect(countLabel(2, 'entry', 'entries')).toBe('2 entries');
    });
});

describe('formatDistance', () => {
    it('uses metres under a kilometre and kilometres above', () => {
        expect(formatDistance(849.6)).toBe('850 m');
        expect(formatDistance(1234)).toBe('1.2 km');
        expect(formatDistance(152000)).toBe('152 km');
    });

    it('is empty when there is nothing to measure', () => {
        expect(formatDistance(NaN)).toBe('');
    });
});
