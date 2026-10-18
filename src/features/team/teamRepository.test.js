import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable stand-in for supabase-js query builders: every method returns the
// builder, and awaiting it (or .single()/.maybeSingle()) yields `result`
let result;
const calls = [];
const builder = new Proxy({}, {
    get(_, prop) {
        if (prop === 'then') return (resolve) => resolve(result);
        return (...args) => {
            calls.push([prop, ...args]);
            return prop === 'single' || prop === 'maybeSingle' ? Promise.resolve(result) : builder;
        };
    }
});
const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({
    supabase: { from: (table) => { calls.push(['from', table]); return builder; }, rpc: (...args) => rpc(...args) }
}));

const team = await import('./teamRepository');

describe('teamRepository', () => {
    beforeEach(() => {
        calls.length = 0;
        rpc.mockReset();
    });

    it('maps the membership row, including the team name', async () => {
        result = { data: { org_id: 'o1', role: 'agent', email: 'a@x.co', organizations: { name: 'Ops', checkin_radius_m: 300 } }, error: null };
        expect(await team.fetchMyMembership('u1')).toEqual({ orgId: 'o1', orgName: 'Ops', checkinRadiusM: 300, demoExpiresAt: null, role: 'agent', email: 'a@x.co' });
        expect(calls).toContainEqual(['eq', 'user_id', 'u1']);
    });

    it('saves the check-in radius, and reports when RLS refused it', async () => {
        result = { data: [{ checkin_radius_m: 250 }], error: null };
        expect(await team.updateCheckinRadius('o1', 250)).toBe(250);
        expect(calls).toContainEqual(['update', { checkin_radius_m: 250 }]);

        result = { data: [], error: null };
        await expect(team.updateCheckinRadius('o1', 250)).rejects.toThrow('Only a team manager');
    });

    it('returns null when the user has no team yet', async () => {
        result = { data: null, error: null };
        expect(await team.fetchMyMembership('u1')).toBeNull();
    });

    it('stores invitation emails trimmed and lower-cased (matches the DB check)', async () => {
        result = { data: { id: 'i1', email: 'agent@x.co', role: 'agent' }, error: null };
        await team.inviteMember({ orgId: 'o1', email: '  Agent@X.co ', role: 'agent', invitedBy: 'u1' });
        expect(calls).toContainEqual(['insert', [{ org_id: 'o1', email: 'agent@x.co', role: 'agent', invited_by: 'u1' }]]);
    });

    it.each([
        ['23505', 'That email has already been invited.'],
        ['23514', 'Enter a valid email address.'],
    ])('turns database error %s into a readable message', async (code, message) => {
        result = { data: null, error: { code, message: 'raw db error' } };
        await expect(team.inviteMember({ orgId: 'o1', email: 'a@x.co', role: 'agent', invitedBy: 'u1' })).rejects.toThrow(message);
    });

    // RLS makes forbidden writes affect 0 rows instead of erroring
    it('treats a role change that touched no rows as refused', async () => {
        result = { data: [], error: null };
        await expect(team.changeMemberRole('u2', 'manager')).rejects.toThrow("can't change");
        result = { data: [{ user_id: 'u2' }], error: null };
        await expect(team.changeMemberRole('u2', 'manager')).resolves.toBeUndefined();
    });

    it('treats a removal that touched no rows as refused', async () => {
        result = { data: [], error: null };
        await expect(team.removeMember('u2')).rejects.toThrow("can't remove");
    });

    it('maps the pending invitation RPC row', async () => {
        rpc.mockResolvedValue({ data: [{ org_id: 'o2', org_name: 'Other', role: 'manager' }], error: null });
        expect(await team.fetchMyPendingInvitation()).toEqual({ orgId: 'o2', orgName: 'Other', role: 'manager' });
        rpc.mockResolvedValue({ data: [], error: null });
        expect(await team.fetchMyPendingInvitation()).toBeNull();
    });

    it('surfaces the server reason when accepting fails', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'Your current team has other members or trips' } });
        await expect(team.acceptPendingInvitation()).rejects.toThrow('other members or trips');
    });
});
