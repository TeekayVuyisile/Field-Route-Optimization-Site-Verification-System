import { json } from '../_lib/http.js';
import { getUserId } from '../_lib/auth.js';
import { getAdminClient } from '../_lib/supabaseAdmin.js';
import { DemoError, switchDemoRole } from '../_lib/demo.js';

/**
 * POST /api/demo/switch   (Authorization: Bearer <demo user's access token>)
 * Returns: { email, role, tokenHash } for the other member of the sandbox
 */
export const POST = async (request) => {
    const userId = await getUserId(request);
    if (!userId) return json(401, { error: 'Sign in required' });

    const admin = getAdminClient();
    if (!admin) return json(503, { error: "The demo isn't set up on this server." });

    try {
        return json(200, await switchDemoRole(admin, userId));
    } catch (error) {
        if (error instanceof DemoError) return json(error.status, { error: error.message });
        console.error('Switching demo role failed:', error);
        return json(500, { error: "Couldn't switch. Please try again." });
    }
};
