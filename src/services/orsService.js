import { calculateDistance } from '../lib/geo';
import { supabase } from '../lib/supabase';
import { chunkWaypoints, mergeDirections } from '../features/navigation/routeChunks';

// ORS calls go through our own /api/ors/* functions, which hold the API key
// server-side and check the user's Supabase session.

export const ORS_MAX_JOBS = 70;
const MAX_RETRIES = 2;
// 502/504 mean ORS itself failed or timed out (each attempt can take the
// server's full 10s); during an ORS outage more retries only add waiting
const MAX_UPSTREAM_FAILURE_RETRIES = 1;
const MAX_RETRY_WAIT_MS = 5000;

export class RoutingError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'RoutingError';
        this.status = status;
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryWaitMs = (response, attempt) => {
    const retryAfter = Number(response?.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 3 ** attempt;
    return Math.min(wait, MAX_RETRY_WAIT_MS);
};

/**
 * POSTs to an /api/ors endpoint. Network failures, 429s and 5xx responses
 * are retried with backoff (honouring Retry-After); other errors throw.
 */
const callRoutingApi = async (endpoint, body) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new RoutingError('Sign in required', 401);

    for (let attempt = 0; ; attempt++) {
        let response;
        try {
            response = await fetch(`/api/ors/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify(body)
            });
        } catch (networkError) {
            if (attempt >= MAX_RETRIES) throw new RoutingError(`Routing service unreachable: ${networkError.message}`, 0);
            await sleep(retryWaitMs(null, attempt));
            continue;
        }

        if (response.ok) return response.json();

        const upstreamFailure = response.status === 502 || response.status === 504;
        const retryable = response.status === 429 || response.status >= 500;
        const maxRetries = upstreamFailure ? MAX_UPSTREAM_FAILURE_RETRIES : MAX_RETRIES;
        if (!retryable || attempt >= maxRetries) {
            const payload = await response.json().catch(() => ({}));
            throw new RoutingError(payload.error || `Routing request failed (${response.status})`, response.status);
        }
        await sleep(retryWaitMs(response, attempt));
    }
};

/**
 * Fallback: Simple Nearest Neighbor algorithm using Haversine
 * @param {Object} start {lat, lng}
 * @param {Array} sites
 * @returns {Array} Ordered sites
 */
export const getNearestNeighborRoute = (start, sites) => {
    let unvisited = [...sites];
    let ordered = [];
    let currentPos = start;

    while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;

        for (let i = 0; i < unvisited.length; i++) {
            const dist = calculateDistance(
                currentPos.lat, currentPos.lng,
                unvisited[i].latitude, unvisited[i].longitude
            );
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = i;
            }
        }

        const nextSite = unvisited.splice(nearestIdx, 1)[0];
        ordered.push(nextSite);
        currentPos = { lat: nextSite.latitude, lng: nextSite.longitude };
    }

    return ordered;
};

/**
 * Get optimized order for sites starting from current position
 * @param {Object} start {lat, lng}
 * @param {Array} sites Array of {id, latitude, longitude}
 * @returns {Promise<Array>} Ordered list of site objects
 */
export const getOptimizedRoute = async (start, sites) => {
    if (!start || sites.length === 0) return [];

    // ORS optimization accepts at most 70 jobs; use the local heuristic above that
    if (sites.length > ORS_MAX_JOBS) {
        console.warn(`Large dataset (${sites.length} sites). Using local nearest-neighbor fallback.`);
        return getNearestNeighborRoute(start, sites);
    }

    let order;
    try {
        ({ order } = await callRoutingApi('optimize', {
            start: [start.lng, start.lat],
            jobs: sites.map((site) => [site.longitude, site.latitude])
        }));
    } catch (error) {
        // ORS down or unreachable: a heuristic order beats no order at all.
        // Auth and validation errors are real bugs, so those still throw.
        const serviceProblem = error instanceof RoutingError && (error.status === 0 || error.status === 429 || error.status >= 500);
        if (!serviceProblem) throw error;
        console.warn(`Optimization unavailable (${error.message}). Using local nearest-neighbor fallback.`);
        return getNearestNeighborRoute(start, sites);
    }

    // The server appends unroutable jobs, but guard anyway: never drop a site
    const seen = new Set(order);
    const missing = sites.map((_, i) => i).filter((i) => !seen.has(i));
    return [...order, ...missing].map((i) => sites[i]);
};

/**
 * Get route directions with full step-by-step instructions. Routes longer
 * than the ORS per-request waypoint limit are fetched in chunks and merged.
 * @param {Array} coordinates Array of [lng, lat]
 * @returns {Promise<Object>} GeoJSON FeatureCollection with steps
 */
export const getDirections = async (coordinates) => {
    const results = [];
    // Sequential, not parallel: keeps us well inside the per-user rate limit
    for (const chunk of chunkWaypoints(coordinates)) {
        results.push(await callRoutingApi('directions', { coordinates: chunk }));
    }
    return mergeDirections(results);
};
