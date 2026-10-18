import { supabase } from '../../lib/supabase';

/**
 * Supabase reads/writes for teams (migration 0005). RLS decides what each
 * role may do; these functions throw on error with a readable message.
 */

/** The signed-in user's team and role, or null if they have none yet. */
export const fetchMyMembership = async (userId) => {
    const { data, error } = await supabase
        .from('org_members')
        .select('org_id, role, email, organizations(name)')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { orgId: data.org_id, orgName: data.organizations?.name ?? '', role: data.role, email: data.email };
};

/** Server-side repair: creates (or joins) a team for the signed-in user. */
export const ensureMembership = async () => {
    const { error } = await supabase.rpc('ensure_my_membership');
    if (error) throw error;
};

export const fetchTeamMembers = async () => {
    const { data, error } = await supabase
        .from('org_members')
        .select('user_id, role, email, created_at')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
};

export const fetchPendingInvitations = async () => {
    const { data, error } = await supabase
        .from('org_invitations')
        .select('id, email, role, created_at')
        .is('accepted_at', null)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
};

export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

export const inviteMember = async ({ orgId, email, role, invitedBy }) => {
    const { data, error } = await supabase
        .from('org_invitations')
        .insert([{ org_id: orgId, email: normalizeEmail(email), role, invited_by: invitedBy }])
        .select('id, email, role, created_at')
        .single();
    if (error) {
        if (error.code === '23505') throw new Error('That email has already been invited.');
        if (error.code === '23514') throw new Error('Enter a valid email address.');
        throw error;
    }
    return data;
};

export const revokeInvitation = async (invitationId) => {
    const { error } = await supabase.from('org_invitations').delete().eq('id', invitationId);
    if (error) throw error;
};

// RLS turns forbidden updates/deletes into "0 rows" rather than an error,
// so these check that a row actually changed
export const changeMemberRole = async (userId, role) => {
    const { data, error } = await supabase.from('org_members').update({ role }).eq('user_id', userId).select('user_id');
    if (error) throw error;
    if (!data?.length) throw new Error("You can't change this member's role.");
};

export const removeMember = async (userId) => {
    const { data, error } = await supabase.from('org_members').delete().eq('user_id', userId).select('user_id');
    if (error) throw error;
    if (!data?.length) throw new Error("You can't remove this member.");
};

/** An invitation to another team for the signed-in user, or null. */
export const fetchMyPendingInvitation = async () => {
    const { data, error } = await supabase.rpc('my_pending_invitation');
    if (error) throw error;
    const row = data?.[0];
    return row ? { orgId: row.org_id, orgName: row.org_name, role: row.role } : null;
};

export const acceptPendingInvitation = async () => {
    const { error } = await supabase.rpc('accept_pending_invitation');
    if (error) throw new Error(error.message);
};
