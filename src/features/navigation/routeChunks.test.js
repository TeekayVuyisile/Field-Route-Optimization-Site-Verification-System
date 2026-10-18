import { describe, it, expect } from 'vitest';
import { chunkWaypoints, mergeDirections, straightLineRoute, isFallbackRoute } from './routeChunks';

describe('straightLineRoute', () => {
    const coords = [[28, -26], [28.1, -26], [28.2, -26.1]];

    it('draws the stops in order with no turn-by-turn steps', () => {
        const route = straightLineRoute(coords);
        expect(route.features[0].geometry.coordinates).toEqual(coords);
        expect(route.features[0].properties.segments).toEqual([]);
    });

    it('is recognisable as a fallback (so off-route detection is skipped)', () => {
        expect(isFallbackRoute(straightLineRoute(coords))).toBe(true);
        expect(isFallbackRoute(mergeDirections([straightLineRoute(coords)]))).toBe(true);
    });

    it('treats real or missing routes as not fallback', () => {
        expect(isFallbackRoute(null)).toBe(false);
        expect(isFallbackRoute({ features: [{ properties: { segments: [] } }] })).toBe(false);
    });
});

const points = (n) => Array.from({ length: n }, (_, i) => [28 + i / 100, -26]);

describe('chunkWaypoints', () => {
    it('returns a single chunk when under the limit', () => {
        expect(chunkWaypoints(points(50))).toHaveLength(1);
    });

    // Regression: 51+ waypoints used to be sent in one request and fail
    it('splits long routes into overlapping chunks within the limit', () => {
        const coords = points(71); // start + 70 sites
        const chunks = chunkWaypoints(coords);
        expect(chunks).toHaveLength(2);
        expect(chunks.every((c) => c.length <= 50 && c.length >= 2)).toBe(true);
        expect(chunks[1][0]).toEqual(chunks[0].at(-1)); // shared junction
    });

    it('covers every point exactly once apart from the junctions', () => {
        const coords = points(120);
        const chunks = chunkWaypoints(coords, 50);
        const rejoined = chunks.flatMap((c, i) => (i === 0 ? c : c.slice(1)));
        expect(rejoined).toEqual(coords);
    });

    it('never produces a 1-point tail chunk', () => {
        const chunks = chunkWaypoints(points(5), 3); // [0,1,2] [2,3,4]
        expect(chunks.map((c) => c.length)).toEqual([3, 3]);
    });
});

// Minimal ORS-shaped response for a chunk: coordinates plus one segment per leg
const orsResponse = (coords, wayPoints, steps, summary) => ({
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {
            segments: [{ distance: summary.distance, duration: summary.duration, steps }],
            way_points: wayPoints,
            summary
        }
    }]
});

describe('mergeDirections', () => {
    it('passes a single response through untouched', () => {
        const r = orsResponse([[0, 0], [1, 1]], [0, 1], [], { distance: 1, duration: 1 });
        expect(mergeDirections([r])).toBe(r);
    });

    it('joins geometry without duplicating the junction and remaps indices', () => {
        const a = orsResponse(
            [[0, 0], [1, 0], [2, 0]], [0, 2],
            [{ instruction: 'Head east', way_points: [0, 2] }],
            { distance: 200, duration: 20 }
        );
        const b = orsResponse(
            [[2, 0], [2, 1], [2, 2], [2, 3]], [0, 3],
            [{ instruction: 'Turn left', way_points: [0, 1] }, { instruction: 'Arrive', way_points: [3, 3] }],
            { distance: 300, duration: 30 }
        );

        const merged = mergeDirections([a, b]).features[0];
        expect(merged.geometry.coordinates).toEqual([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [2, 3]]);

        const steps = merged.properties.segments.flatMap((s) => s.steps);
        expect(steps.map((s) => s.way_points)).toEqual([[0, 2], [2, 3], [5, 5]]);
        // Every step index must point at the same coordinate it did in its chunk
        expect(merged.geometry.coordinates[steps[2].way_points[0]]).toEqual([2, 3]);

        expect(merged.properties.way_points).toEqual([0, 2, 5]);
        expect(merged.properties.summary).toEqual({ distance: 500, duration: 50 });
    });
});
