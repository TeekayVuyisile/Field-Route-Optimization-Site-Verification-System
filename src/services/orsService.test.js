import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let session = { access_token: 'token-123' };
vi.mock('../lib/supabase', () => ({
    supabase: { auth: { getSession: async () => ({ data: { session } }) } }
}));

const { getNearestNeighborRoute, getOptimizedRoute, getDirections, RoutingError } = await import('./orsService');

const site = (id, latitude, longitude) => ({ id, latitude, longitude });
const jsonResponse = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers });

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

describe('routing API calls', () => {
    let fetchMock;

    beforeEach(() => {
        session = { access_token: 'token-123' };
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('getOptimizedRoute', () => {
        const sites = [site('a', -26, 28.1), site('b', -26, 28.2), site('c', -26, 28.3)];

        it('returns an empty route without a start position', async () => {
            expect(await getOptimizedRoute(null, sites)).toEqual([]);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('uses the local fallback (no network) above the 70-job ORS limit', async () => {
            const many = Array.from({ length: 71 }, (_, i) => site(`s${i}`, -26, 28 + i * 0.01));
            const ordered = await getOptimizedRoute({ lat: -26, lng: 28 }, many);
            expect(ordered).toHaveLength(71);
            expect(ordered[0].id).toBe('s0');
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('calls our proxy with the session token, never ORS directly', async () => {
            fetchMock.mockResolvedValue(jsonResponse(200, { order: [2, 0, 1] }));
            const ordered = await getOptimizedRoute({ lat: -26, lng: 28 }, sites);

            expect(ordered.map(s => s.id)).toEqual(['c', 'a', 'b']);
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('/api/ors/optimize');
            expect(init.headers.Authorization).toBe('Bearer token-123');
            expect(JSON.parse(init.body)).toEqual({
                start: [28, -26],
                jobs: [[28.1, -26], [28.2, -26], [28.3, -26]]
            });
        });

        it('never drops a site even if the response leaves one out', async () => {
            fetchMock.mockResolvedValue(jsonResponse(200, { order: [1] }));
            const ordered = await getOptimizedRoute({ lat: -26, lng: 28 }, sites);
            expect(ordered.map(s => s.id)).toEqual(['b', 'a', 'c']);
        });

        it('refuses to call without a session', async () => {
            session = null;
            await expect(getOptimizedRoute({ lat: -26, lng: 28 }, sites)).rejects.toMatchObject({ status: 401 });
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('retries', () => {
        const run = () => getOptimizedRoute({ lat: -26, lng: 28 }, [site('a', -26, 28.1)]);

        it('retries a 503 with backoff and then succeeds', async () => {
            fetchMock
                .mockResolvedValueOnce(jsonResponse(503, { error: 'busy' }))
                .mockResolvedValueOnce(jsonResponse(200, { order: [0] }));

            const promise = run();
            await vi.advanceTimersByTimeAsync(500);
            expect((await promise).map(s => s.id)).toEqual(['a']);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('honours Retry-After on 429', async () => {
            fetchMock
                .mockResolvedValueOnce(jsonResponse(429, { error: 'slow down' }, { 'Retry-After': '2' }))
                .mockResolvedValueOnce(jsonResponse(200, { order: [0] }));

            const promise = run();
            await vi.advanceTimersByTimeAsync(1999);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);
            await promise;
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('retries network failures', async () => {
            fetchMock
                .mockRejectedValueOnce(new TypeError('Failed to fetch'))
                .mockResolvedValueOnce(jsonResponse(200, { order: [0] }));

            const promise = run();
            await vi.advanceTimersByTimeAsync(500);
            await promise;
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        const directions = () => getDirections([[28, -26], [28.1, -26]]);

        it('gives up on a 503 after 2 retries with the server message', async () => {
            fetchMock.mockResolvedValue(jsonResponse(503, { error: 'Routing service busy' }));

            const promise = directions();
            const assertion = expect(promise).rejects.toThrow('Routing service busy');
            await vi.advanceTimersByTimeAsync(500 + 1500);
            await assertion;
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        // Regression: during an ORS outage, 3 attempts x 20s kept the spinner up for over a minute
        it.each([502, 504])('retries an upstream %i only once', async (status) => {
            fetchMock.mockResolvedValue(jsonResponse(status, { error: 'Routing service timed out' }));

            const promise = directions();
            const assertion = expect(promise).rejects.toThrow('Routing service timed out');
            await vi.advanceTimersByTimeAsync(500);
            await assertion;
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('falls back to the local order when optimization is down', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            fetchMock.mockResolvedValue(jsonResponse(504, { error: 'Routing service timed out' }));
            const sites = [site('far', -26, 28.3), site('near', -26, 28.1)];

            const promise = getOptimizedRoute({ lat: -26, lng: 28 }, sites);
            await vi.advanceTimersByTimeAsync(500);

            expect((await promise).map(s => s.id)).toEqual(['near', 'far']);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('nearest-neighbor fallback'));
            warn.mockRestore();
        });

        it('does not retry client errors', async () => {
            fetchMock.mockResolvedValue(jsonResponse(400, { error: 'jobs must be 1-70 [lng, lat] pairs' }));
            await expect(run()).rejects.toBeInstanceOf(RoutingError);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('getDirections', () => {
        const fakeDirections = (coords) => ({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: coords },
                properties: {
                    segments: [{ steps: [{ instruction: 'go', way_points: [0, coords.length - 1] }] }],
                    way_points: [0, coords.length - 1],
                    summary: { distance: 1, duration: 1 }
                }
            }]
        });

        it('makes one request for a short route', async () => {
            fetchMock.mockImplementation(async (_url, init) => jsonResponse(200, fakeDirections(JSON.parse(init.body).coordinates)));
            await getDirections([[28, -26], [28.1, -26]]);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('splits a 71-point route into 2 requests of at most 50 and merges them', async () => {
            fetchMock.mockImplementation(async (_url, init) => jsonResponse(200, fakeDirections(JSON.parse(init.body).coordinates)));
            const coords = Array.from({ length: 71 }, (_, i) => [28 + i / 100, -26]);

            const merged = await getDirections(coords);

            expect(fetchMock).toHaveBeenCalledTimes(2);
            for (const [, init] of fetchMock.mock.calls) {
                expect(JSON.parse(init.body).coordinates.length).toBeLessThanOrEqual(50);
            }
            expect(merged.features[0].geometry.coordinates).toEqual(coords);
        });
    });
});
