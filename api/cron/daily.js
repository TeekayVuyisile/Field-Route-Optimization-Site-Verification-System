import { json } from '../_lib/http.js';
import { getAdminClient } from '../_lib/supabaseAdmin.js';
import { cleanupExpiredDemos } from '../_lib/demo.js';
import { pingDatabase } from '../_lib/keepalive.js';

/**
 * GET /api/cron/daily: run once a day by Vercel Cron (vercel.json), which
 * sends "Authorization: Bearer $CRON_SECRET".
 *  1. keeps the Supabase free tier from pausing (a real database write)
 *  2. removes expired demo sandboxes
 * Each job runs even if the other fails; any failure makes the run a 500 so
 * it shows up in Vercel's logs.
 */
export const GET = async (request) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return json(503, { error: 'CRON_SECRET is not set' });
    if (request.headers.get('authorization') !== `Bearer ${secret}`) return json(401, { error: 'Unauthorized' });

    const result = {};
    let failed = false;

    try {
        result.keepalive = await pingDatabase('vercel-cron');
    } catch (error) {
        console.error('Keep-alive ping failed:', error);
        result.keepaliveError = error.message;
        failed = true;
    }

    const admin = getAdminClient();
    if (admin) {
        try {
            result.demosRemoved = await cleanupExpiredDemos(admin);
        } catch (error) {
            console.error('Demo cleanup failed:', error);
            result.demoCleanupError = error.message;
            failed = true;
        }
    } else {
        result.demoCleanup = 'skipped: SUPABASE_SERVICE_ROLE_KEY is not set';
    }

    return json(failed ? 500 : 200, result);
};
