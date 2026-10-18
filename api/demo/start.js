import { json } from '../_lib/http.js';
import { createRateLimiter } from '../_lib/rateLimit.js';
import { getAdminClient } from '../_lib/supabaseAdmin.js';
import { DemoError, startDemo } from '../_lib/demo.js';

// A few sandboxes per visitor per hour (best effort: per warm instance);
// MAX_ACTIVE_SANDBOXES in demo.js is the hard cap
const limitPerIp = createRateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 });

const clientIp = (request) => (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

/**
 * POST /api/demo/start
 * Returns: { email, tokenHash, expiresAt }: the browser signs in with
 * supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
 */
export const POST = async (request) => {
    const admin = getAdminClient();
    if (!admin) return json(503, { error: "The demo isn't set up on this server." });

    const { allowed, retryAfterSeconds } = limitPerIp(clientIp(request));
    if (!allowed) {
        return json(429, { error: "You've started a few demos already. Please try again later." }, { 'Retry-After': String(retryAfterSeconds) });
    }

    try {
        return json(200, await startDemo(admin));
    } catch (error) {
        if (error instanceof DemoError) return json(error.status, { error: error.message });
        console.error('Starting a demo failed:', error);
        return json(500, { error: "Couldn't start the demo. Please try again." });
    }
};
