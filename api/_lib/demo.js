// Private demo sandboxes for portfolio visitors (see migration 0009).
//
// Each "Try the demo" creates a manager + agent pair with random passwords
// nobody ever sees, seeds their team, and hands the browser a one-time
// sign-in token (a magic-link hash; no email is sent). Sandboxes expire and
// are removed with their photo files.
//
// `admin` is a Supabase client created with the service-role key: server
// only, it bypasses row-level security.
import { randomBytes, randomUUID } from 'node:crypto';

export const DEMO_TTL_HOURS = 24;
export const MAX_ACTIVE_SANDBOXES = 50;

export class DemoError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

// example.com is reserved for examples (RFC 2606): never a real inbox
const demoEmail = (tag, role) => `demo-${tag}-${role}@example.com`;

const createDemoUser = async (admin, email, role) => {
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password: randomBytes(24).toString('base64url'),
        email_confirm: true,
        app_metadata: { demo: true },
        user_metadata: { display_name: role === 'manager' ? 'Demo manager' : 'Demo agent' },
    });
    if (error) throw error;
    return data.user;
};

/** One-time sign-in for a demo user: the browser exchanges it with verifyOtp */
const signInToken = async (admin, email) => {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error) throw error;
    return data.properties.hashed_token;
};

const removeFiles = async (admin, paths) => {
    for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from('site-photos').remove(paths.slice(i, i + 100));
        if (error) throw error;
    }
};

/**
 * Removes expired sandboxes: photo files, then the team (its trips, sites,
 * photo records, members and checklists go with it), then the logins.
 * @returns {Promise<number>} sandboxes removed
 */
export const cleanupExpiredDemos = async (admin) => {
    const { data: expired, error } = await admin.rpc('expired_demo_teams');
    if (error) throw error;

    let removed = 0;
    for (const team of expired ?? []) {
        await removeFiles(admin, team.file_paths ?? []);
        const { error: orgError } = await admin.from('organizations').delete().eq('id', team.org_id);
        if (orgError) throw orgError;
        for (const userId of team.user_ids ?? []) {
            const { error: userError } = await admin.auth.admin.deleteUser(userId);
            if (userError) throw userError;
        }
        removed += 1;
    }
    return removed;
};

/**
 * Creates and seeds a sandbox.
 * @returns {Promise<{ email: string, tokenHash: string, expiresAt: string }>}
 */
export const startDemo = async (admin, { now = new Date() } = {}) => {
    // Tidy up first, so expired sandboxes don't count against the cap
    try {
        await cleanupExpiredDemos(admin);
    } catch (error) {
        console.error('Demo cleanup failed:', error);
    }

    const { count, error: countError } = await admin
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .not('demo_expires_at', 'is', null);
    if (countError) throw countError;
    if (count >= MAX_ACTIVE_SANDBOXES) {
        throw new DemoError('The demo is busy right now. Please try again in a little while.', 503);
    }

    const tag = randomUUID().slice(0, 8);
    const created = [];
    try {
        const manager = await createDemoUser(admin, demoEmail(tag, 'manager'), 'manager');
        created.push(manager.id);
        const agent = await createDemoUser(admin, demoEmail(tag, 'agent'), 'agent');
        created.push(agent.id);

        const expiresAt = new Date(now.getTime() + DEMO_TTL_HOURS * 3600 * 1000).toISOString();
        const { error: seedError } = await admin.rpc('seed_demo_team', {
            p_manager: manager.id, p_agent: agent.id, p_expires_at: expiresAt,
        });
        if (seedError) throw seedError;

        return { email: manager.email, tokenHash: await signInToken(admin, manager.email), expiresAt };
    } catch (error) {
        // Don't leave half-made sandboxes behind: each new login's team (the
        // seed is one transaction, so it holds no trips), then the login
        for (const userId of created) {
            try {
                const { data } = await admin.from('org_members').select('org_id').eq('user_id', userId).maybeSingle();
                if (data?.org_id) await admin.from('organizations').delete().eq('id', data.org_id);
                await admin.auth.admin.deleteUser(userId);
            } catch (cleanupError) {
                console.error('Demo rollback failed:', cleanupError);
            }
        }
        throw error;
    }
};

/**
 * Signs a demo user in as the OTHER member of their sandbox (manager <->
 * agent), so a visitor can see both sides.
 */
export const switchDemoRole = async (admin, userId) => {
    const { data: me, error } = await admin
        .from('org_members')
        .select('org_id, organizations(demo_expires_at)')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    if (!me?.organizations?.demo_expires_at) throw new DemoError('Only demo accounts can switch roles.', 403);

    const { data: other, error: otherError } = await admin
        .from('org_members')
        .select('email, role')
        .eq('org_id', me.org_id)
        .neq('user_id', userId)
        .maybeSingle();
    if (otherError) throw otherError;
    if (!other) throw new DemoError('This sandbox has no other account.', 404);

    return { email: other.email, role: other.role, tokenHash: await signInToken(admin, other.email) };
};
