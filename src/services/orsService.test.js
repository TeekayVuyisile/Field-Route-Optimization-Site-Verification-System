import { describe, it, expect } from 'vitest';
import { getNearestNeighborRoute, getOptimizedRoute } from './orsService';

const site = (id, latitude, longitude) => ({ id, latitude, longitude });

describe('getNearestNeighborRoute', () => {
    it('visits the closest unvisited site each time', () => {
        const start = { lat: -26.0, lng: 28.0 };
        const sites = [
            site('far', -26.0, 28.3),
            site('near', -26.0, 28.1),
            site('mid', -26.0, 28.2),
        ];
        expect(getNearestNeighborRoute(start, sites).map(s => s.id)).toEqual(['near', 'mid', 'far']);
    });

    it('does not mutate the input array', () => {
        const sites = [site('a', -26, 28.1), site('b', -26, 28.2)];
        const copy = [...sites];
        getNearestNeighborRoute({ lat: -26, lng: 28 }, sites);
        expect(sites).toEqual(copy);
    });

    it('returns an empty route for no sites', () => {
        expect(getNearestNeighborRoute({ lat: -26, lng: 28 }, [])).toEqual([]);
    });
});

describe('getOptimizedRoute', () => {
    it('returns an empty route without a start position', async () => {
        expect(await getOptimizedRoute(null, [site('a', -26, 28)])).toEqual([]);
    });

    it('uses the local fallback (no network) above the 70-job ORS limit', async () => {
        const sites = Array.from({ length: 71 }, (_, i) => site(`s${i}`, -26, 28 + i * 0.01));
        const ordered = await getOptimizedRoute({ lat: -26, lng: 28 }, sites);
        expect(ordered).toHaveLength(71);
        expect(ordered[0].id).toBe('s0');
    });
});
