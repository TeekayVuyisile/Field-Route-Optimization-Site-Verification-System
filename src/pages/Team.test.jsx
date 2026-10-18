import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

let teamValue;
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('../context/useTeam', () => ({ useTeam: () => teamValue }));

const fetchPendingInvitations = vi.fn();
vi.mock('../features/team/teamRepository', () => ({
    fetchTeamMembers: async () => [
        { user_id: 'me', role: 'manager', email: 'me@x.co', created_at: '2026-10-01' },
        { user_id: 'u2', role: 'agent', email: 'agent@x.co', created_at: '2026-10-02' },
    ],
    fetchPendingInvitations: (...args) => fetchPendingInvitations(...args),
    inviteMember: vi.fn(),
    revokeInvitation: vi.fn(),
    changeMemberRole: vi.fn(),
    removeMember: vi.fn(),
}));

const { default: Team } = await import('./Team');

describe('Team page', () => {
    beforeEach(() => {
        fetchPendingInvitations.mockReset().mockResolvedValue([{ id: 'i1', email: 'new@x.co', role: 'agent' }]);
    });

    it('lets a manager invite, see pending invites and manage teammates (not themselves)', async () => {
        teamValue = { membership: { orgId: 'o1', orgName: 'Ops Team', role: 'manager' }, isManager: true, loading: false };
        render(<Team />);

        expect(await screen.findByRole('heading', { name: 'Ops Team' })).toBeInTheDocument();
        expect(screen.getByLabelText('Email')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel invitation for new@x.co' })).toBeInTheDocument();
        expect(screen.getByLabelText('Role for agent@x.co')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove agent@x.co' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Role for me@x.co')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove me@x.co' })).not.toBeInTheDocument();
    });

    it('shows an agent the member list only', async () => {
        teamValue = { membership: { orgId: 'o1', orgName: 'Ops Team', role: 'agent' }, isManager: false, loading: false };
        render(<Team />);

        expect(await screen.findByText('agent@x.co')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByLabelText('Email')).not.toBeInTheDocument());
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
        expect(fetchPendingInvitations).not.toHaveBeenCalled();
    });
});
