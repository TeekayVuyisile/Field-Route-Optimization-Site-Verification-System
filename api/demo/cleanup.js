import { json } from '../_lib/http.js';
import { getAdminClient } from '../_lib/supabaseAdmin.js';
import { cleanupExpiredDemos } from '../_lib/demo.js';

/**
 * GET /api/demo/cleanup: removes expired sandboxes. Called daily by Vercel
 * Cron (vercel.json), which sends "Authorization: Bearer $CRON_SECRET".
 * Starting a demo also cleans up, so this is the backstop for quiet days.
 */
export const GET = async (request) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return json(503, { error: 'CRON_SECRET is not set' });
    if (request.headers.get('authorization') !== `Bearer ${secret}`) return json(401, { error: 'Unauthorized' });

    const admin = getAdminClient();
    if (!admin) return json(503, { error: "The demo isn't set up on this server." });

    try {
        return json(200, { removed: await cleanupExpiredDemos(admin) });
    } catch (error) {
        console.error('Demo cleanup failed:', error);
        return json(500, { error: 'Cleanup failed' });
    }
};
