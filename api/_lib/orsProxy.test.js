// @vitest-environment node
// Endpoint tests live here, not next to the endpoints: every .js file under
// api/ (outside _-prefixed folders) is deployed by Vercel as a function.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST as optimize } from '../ors/optimize.js';
import { POST as directions } from '../ors/directions.js';
import { clearAuthCache } from './auth.js';

const SUPABASE_URL = 'https://proj.supabase.co';
let userCounter = 0;

const request = (body, token = 'good-token') => new Request('http://localhost/api/ors/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
});

describe('ORS proxy endpoints', () => {
    let fetchMock;
    let userId;

    beforeEach(() => {
        clearAuthCache();
        // Fresh user per test so the in-memory rate limiter starts empty
        userId = `user-${++userCounter}`;
        vi.stubEnv('ORS_API_KEY', 'secret-ors-key');
        vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
        vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
        vi.spyOn(console, 'error').mockImplementation(() => {});

        fetchMock = vi.fn(async (url, init) => {
            if (url === `${SUPABASE_URL}/auth/v1/user`) {
                return init.headers.Authorization === 'Bearer good-token'
                    ? Response.json({ id: userId })
                    : Response.json({ msg: 'invalid JWT' }, { status: 401 });
            }
            if (url.endsWith('/optimization')) {
                return Response.json({
                    routes: [{ steps: [{ type: 'start' }, { type: 'job', id: 1 }, { type: 'job', id: 0 }, { type: 'end' }] }],
                    unassigned: [{ id: 2 }]
                });
            }
            if (url.endsWith('/v2/directions/driving-car/geojson')) {
                return Response.json({ type: 'FeatureCollection', features: [] });
            }
            throw new Error(`unexpected fetch ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const validOptimize = { start: [28, -26], jobs: [[28.1, -26], [28.2, -26], [28.3, -26]] };
    const orsCall = () => fetchMock.mock.calls.find(([url]) => url.startsWith('https://api.openrouteservice.org'));

    it('rejects requests without a valid session and never calls ORS', async () => {
        expect((await optimize(request(validOptimize, null))).status).toBe(401);
        expect((await optimize(request(validOptimize, 'forged'))).status).toBe(401);
        expect(orsCall()).toBeUndefined();
    });

    it('sends the API key to ORS server-side only', async () => {
        const response = await optimize(request(validOptimize));
        expect(response.status).toBe(200);
        expect(orsCall()[1].headers.Authorization).toBe('secret-ors-key');
        expect(JSON.stringify(await response.json())).not.toContain('secret-ors-key');
    });

    it('returns visiting order with unroutable jobs appended', async () => {
        const response = await optimize(request(validOptimize));
        expect(await response.json()).toEqual({ order: [1, 0, 2] });
    });

    it('builds the ORS body itself from validated input', async () => {
        await optimize(request({ ...validOptimize, extra: 'ignored' }));
        expect(JSON.parse(orsCall()[1].body)).toEqual({
            jobs: [
                { id: 0, location: [28.1, -26] },
                { id: 1, location: [28.2, -26] },
                { id: 2, location: [28.3, -26] }
            ],
            vehicles: [{ id: 1, profile: 'driving-car', start: [28, -26] }]
        });
    });

    it('rejects invalid bodies with 400', async () => {
        const response = await optimize(request({ start: [28, -26], jobs: [] }));
        expect(response.status).toBe(400);
        expect(orsCall()).toBeUndefined();
    });

    it('rate limits per user with Retry-After', async () => {
        for (let i = 0; i < 30; i++) await optimize(request(validOptimize));
        const response = await optimize(request(validOptimize));
        expect(response.status).toBe(429);
        expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    });

    it('maps ORS server errors to 502 and keeps ORS 4xx messages', async () => {
        fetchMock.mockImplementationOnce(async () => Response.json({ id: userId }));
        fetchMock.mockImplementationOnce(async () => Response.json({ error: 'boom' }, { status: 500 }));
        expect((await optimize(request(validOptimize))).status).toBe(502);

        fetchMock.mockImplementationOnce(async () => Response.json({ error: { message: 'Could not find routable point' } }, { status: 404 }));
        const response = await optimize(request(validOptimize));
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'Could not find routable point' });
    });

    it('reports a missing ORS key as a config error', async () => {
        vi.stubEnv('ORS_API_KEY', '');
        expect((await optimize(request(validOptimize))).status).toBe(500);
    });

    it('directions: forwards coordinates with snapping and instructions', async () => {
        const response = await directions(request({ coordinates: [[28, -26], [28.1, -26]] }));
        expect(response.status).toBe(200);
        expect(JSON.parse(orsCall()[1].body)).toEqual({
            coordinates: [[28, -26], [28.1, -26]],
            instructions: true,
            units: 'm',
            preference: 'recommended',
            radiuses: [-1, -1]
        });
    });

    it('directions: rejects more than 50 waypoints', async () => {
        const coordinates = Array.from({ length: 51 }, () => [28, -26]);
        expect((await directions(request({ coordinates }))).status).toBe(400);
    });
});
