import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupExpiredDemos, DemoError, MAX_ACTIVE_SANDBOXES, startDemo, switchDemoRole } from './demo.js';

// Fake service-role client: records every call; `respond(table, ops)` decides
// what each awaited query returns
const makeAdmin = (respond = () => ({ data: null, error: null })) => {
    const log = [];
    const query = (table) => {
        const ops = [];
        const q = new Proxy({}, {
            get(_, prop) {
                if (prop === 'then') return (resolve) => resolve(respond(table, ops));
                return (...args) => {
                    ops.push([prop, ...args]);
                    log.push([table, prop, ...args]);
                    return q;
                };
            },
        });
        return q;
    };
    let n = 0;
    const admin = {
        log,
        from: (table) => query(table),
        rpc: vi.fn(async () => ({ data: [], error: null })),
        storage: { from: () => ({ remove: vi.fn(async (paths) => { log.push(['storage', 'remove', paths]); return { error: null }; }) }) },
        auth: {
            admin: {
                createUser: vi.fn(async ({ email }) => ({ data: { user: { id: `u${++n}`, email } }, error: null })),
                generateLink: vi.fn(async ({ email }) => ({ data: { properties: { hashed_token: `hash-for-${email}` } }, error: null })),
                deleteUser: vi.fn(async () => ({ error: null })),
            },
        },
    };
    return admin;
};

describe('startDemo', () => {
    let admin;
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        admin = makeAdmin((table, ops) => (ops.some(([op]) => op === 'select') && table === 'organizations' ? { count: 3, error: null } : { data: null, error: null }));
    });

    it('creates a confirmed manager and agent with unseen passwords, seeds them and returns a one-time sign-in', async () => {
        const now = new Date('2026-10-18T10:00:00Z');
        const result = await startDemo(admin, { now });

        const [managerArgs, agentArgs] = admin.auth.admin.createUser.mock.calls.map(([args]) => args);
        expect(managerArgs).toMatchObject({ email: expect.stringMatching(/^demo-\w{8}-manager@example\.com$/), email_confirm: true, app_metadata: { demo: true } });
        expect(agentArgs.email).toMatch(/-agent@example\.com$/);
        expect(managerArgs.password.length).toBeGreaterThanOrEqual(32);
        expect(managerArgs.password).not.toBe(agentArgs.password);

        expect(admin.rpc).toHaveBeenCalledWith('seed_demo_team', { p_manager: 'u1', p_agent: 'u2', p_expires_at: '2026-10-19T10:00:00.000Z' });
        expect(result).toEqual({ email: managerArgs.email, tokenHash: `hash-for-${managerArgs.email}`, expiresAt: '2026-10-19T10:00:00.000Z' });
    });

    it('cleans up expired sandboxes before starting', async () => {
        await startDemo(admin);
        expect(admin.rpc.mock.calls[0][0]).toBe('expired_demo_teams');
    });

    it('refuses when too many sandboxes are active', async () => {
        admin = makeAdmin(() => ({ count: MAX_ACTIVE_SANDBOXES, error: null }));
        await expect(startDemo(admin)).rejects.toBeInstanceOf(DemoError);
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('rolls back the logins and their teams if seeding fails', async () => {
        admin = makeAdmin((table, ops) => {
            if (table === 'organizations' && ops.some(([op]) => op === 'select')) return { count: 0, error: null };
            if (table === 'org_members') return { data: { org_id: 'org-x' }, error: null };
            return { data: null, error: null };
        });
        admin.rpc.mockImplementation(async (name) => (name === 'seed_demo_team' ? { error: { message: 'boom' } } : { data: [], error: null }));

        await expect(startDemo(admin)).rejects.toMatchObject({ message: 'boom' });
        expect(admin.auth.admin.deleteUser.mock.calls.map(([id]) => id)).toEqual(['u1', 'u2']);
        expect(admin.log).toContainEqual(['organizations', 'eq', 'id', 'org-x']);
    });
});

describe('switchDemoRole', () => {
    it('signs in as the other member of a demo sandbox', async () => {
        const admin = makeAdmin((table, ops) => (ops.some(([op]) => op === 'neq')
            ? { data: { email: 'demo-x-agent@example.com', role: 'agent' }, error: null }
            : { data: { org_id: 'o1', organizations: { demo_expires_at: '2026-10-19T00:00:00Z' } }, error: null }));
        expect(await switchDemoRole(admin, 'u1')).toEqual({ email: 'demo-x-agent@example.com', role: 'agent', tokenHash: 'hash-for-demo-x-agent@example.com' });
        expect(admin.log).toContainEqual(['org_members', 'neq', 'user_id', 'u1']);
    });

    it('refuses a real account (no sign-in into anyone else)', async () => {
        const admin = makeAdmin(() => ({ data: { org_id: 'o1', organizations: { demo_expires_at: null } }, error: null }));
        await expect(switchDemoRole(admin, 'real-user')).rejects.toMatchObject({ status: 403 });
        expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
    });
});

describe('cleanupExpiredDemos', () => {
    it('removes files, then the team, then the logins', async () => {
        const admin = makeAdmin();
        admin.rpc.mockResolvedValue({ data: [{ org_id: 'o1', user_ids: ['u1', 'u2'], file_paths: ['u2/a.jpg', 'u2/a_thumb.jpg'] }], error: null });

        expect(await cleanupExpiredDemos(admin)).toBe(1);
        const order = admin.log.map(([table, op]) => `${table}.${op}`).filter((s) => s === 'storage.remove' || s === 'organizations.delete');
        expect(order).toEqual(['storage.remove', 'organizations.delete']);
        expect(admin.log).toContainEqual(['storage', 'remove', ['u2/a.jpg', 'u2/a_thumb.jpg']]);
        expect(admin.auth.admin.deleteUser.mock.calls.map(([id]) => id)).toEqual(['u1', 'u2']);
    });
});
