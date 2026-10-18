import { json, readJson } from './http.js';
import { getUserId } from './auth.js';
import { createRateLimiter } from './rateLimit.js';

// api.openrouteservice.org is deprecated (quota cut to 10% from Aug 2026,
// shut down Nov 2026). Same keys work here; paths differ per service.
export const ORS_BASE_URL = 'https://api.heigit.org';
// A healthy ORS answers in ~1s; waiting longer only keeps a driver staring
// at a spinner during an ORS outage
const ORS_TIMEOUT_MS = 10_000;

// Generous for one driver (an optimize + a few reroutes a minute), tight
// enough to stop a client stuck in a loop from burning the daily ORS quota
const rateLimit = createRateLimiter({ limit: 30, windowMs: 60_000 });

/**
 * Shared request pipeline for ORS proxy endpoints:
 * auth -> rate limit -> validate -> call ORS -> shape response.
 *
 * @param {Request} request
 * @param {Object} opts
 * @param {(body) => string|null} opts.validate  error message or null
 * @param {string} opts.path  ORS path
 * @param {(body) => Object} opts.buildOrsBody
 * @param {(orsData) => Object} [opts.shapeResponse]
 */
export const handleOrsRequest = async (request, { validate, path, buildOrsBody, shapeResponse = (d) => d }) => {
    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
        console.error('ORS_API_KEY is not set');
        return json(500, { error: 'Routing service is not configured' });
    }

    let userId;
    try {
        userId = await getUserId(request);
    } catch (error) {
        console.error('Auth check failed:', error);
        return json(503, { error: 'Could not verify session, try again' });
    }
    if (!userId) return json(401, { error: 'Sign in required' });

    const limit = rateLimit(userId);
    if (!limit.allowed) {
        return json(429, { error: 'Too many routing requests, slow down' }, { 'Retry-After': String(limit.retryAfterSeconds) });
    }

    const body = await readJson(request);
    const problem = validate(body);
    if (problem) return json(400, { error: problem });

    let orsResponse;
    try {
        orsResponse = await fetch(`${ORS_BASE_URL}${path}`, {
            method: 'POST',
            headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(buildOrsBody(body)),
            signal: AbortSignal.timeout(ORS_TIMEOUT_MS)
        });
    } catch (error) {
        if (error.name === 'TimeoutError') {
            console.error(`ORS ${path} timed out after ${ORS_TIMEOUT_MS}ms`);
            return json(504, { error: 'Routing service timed out' });
        }
        console.error('ORS unreachable:', error);
        return json(502, { error: 'Routing service unreachable' });
    }

    const data = await orsResponse.json().catch(() => null);
    if (!orsResponse.ok) {
        console.error(`ORS ${path} ${orsResponse.status}:`, data);
        // Pass through rate limits and client errors (e.g. unroutable point);
        // anything else is our upstream's fault
        const status = orsResponse.status === 429 || orsResponse.status < 500 ? orsResponse.status : 502;
        const headers = orsResponse.headers.get('retry-after') ? { 'Retry-After': orsResponse.headers.get('retry-after') } : {};
        return json(status, { error: data?.error?.message || data?.error || 'Routing request failed' }, headers);
    }

    return json(200, shapeResponse(data));
};
