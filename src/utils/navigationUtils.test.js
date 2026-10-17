import { describe, it, expect } from 'vitest';
import { isOffRoute, getDistanceToSegment } from './navigationUtils';

// A straight east-west road segment, ~1 km long. Polylines are [lng, lat] (GeoJSON order).
const polyline = [[28.000, -26.000], [28.010, -26.000]];

describe('getDistanceToSegment', () => {
    it('measures perpendicular distance to the middle of a segment', () => {
        const d = getDistanceToSegment(
            { lat: -26.001, lng: 28.005 },
            { lat: -26.000, lng: 28.000 },
            { lat: -26.000, lng: 28.010 }
        );
        expect(d).toBeGreaterThan(105); // 0.001° of latitude ≈ 111 m
        expect(d).toBeLessThan(115);
    });

    it('clamps to the nearest endpoint when past the end of the segment', () => {
        const d = getDistanceToSegment(
            { lat: -26.000, lng: 28.020 },
            { lat: -26.000, lng: 28.000 },
            { lat: -26.000, lng: 28.010 }
        );
        expect(d).toBeGreaterThan(950); // ~1 km past the end
    });
});

describe('isOffRoute', () => {
    it('is false when on the road', () => {
        expect(isOffRoute({ lat: -26.000, lng: 28.005 }, polyline, 150)).toBe(false);
    });

    it('is false within the threshold', () => {
        expect(isOffRoute({ lat: -26.001, lng: 28.005 }, polyline, 150)).toBe(false);
    });

    it('is true beyond the threshold', () => {
        expect(isOffRoute({ lat: -26.002, lng: 28.005 }, polyline, 150)).toBe(true);
    });

    it('is false when there is no usable polyline', () => {
        expect(isOffRoute({ lat: -26, lng: 28 }, null, 150)).toBe(false);
        expect(isOffRoute({ lat: -26, lng: 28 }, [[28, -26]], 150)).toBe(false);
    });
});
