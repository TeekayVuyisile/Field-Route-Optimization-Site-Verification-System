import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let teamValue;
// Stable object, like the real AuthContext (a new user object per render
// would re-trigger the dashboard's fetch effect)
const authValue = { user: { id: 'me' } };
vi.mock('../context/useAuth', () => ({ useAuth: () => authValue }));
vi.mock('../context/useTeam', () => ({ useTeam: () => teamValue }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const trips = [
    { id: 't1', title: 'Soweto run', status: 'in_progress', user_id: 'me', assigned_to: 'agent', created_at: '2026-10-01', siteCount: 10, checkedCount: 4 },
    { id: 't2', title: 'Done run', status: 'completed', user_id: 'agent', assigned_to: 'agent', created_at: '2026-09-01', siteCount: 3, checkedCount: 3 },
    { id: 't3', title: 'Fresh run', status: 'draft', user_id: 'agent', assigned_to: null, created_at: '2026-10-02', siteCount: 5, checkedCount: 0 },
];
const fetchTripsWithProgress = vi.fn();
const deleteTrip = vi.fn();
vi.mock('../features/trips/tripRepository', () => ({
    fetchTripsWithProgress: (...a) => fetchTripsWithProgress(...a),
    deleteTrip: (...a) => deleteTrip(...a),
    fetchTripWithSites: vi.fn(),
    updateTrip: vi.fn(),
}));
vi.mock('../features/team/teamRepository', () => ({
    fetchTeamMembers: async () => [
        { user_id: 'me', email: 'me@x.co', role: 'manager' },
        { user_id: 'agent', email: 'agent@x.co', role: 'agent' },
    ],
    acceptPendingInvitation: vi.fn(),
}));

const { default: Dashboard } = await import('./Dashboard');

const renderDashboard = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);
const manager = { membership: { orgId: 'o1', role: 'manager' }, isManager: true, loading: false, error: null };
const agent = { membership: { orgId: 'o1', role: 'agent' }, isManager: false, loading: false, error: null };

describe('Dashboard', () => {
    beforeEach(() => {
        fetchTripsWithProgress.mockReset().mockResolvedValue(trips);
        deleteTrip.mockReset().mockResolvedValue();
    });

    it('shows active trips first, with filter counts', async () => {
        teamValue = manager;
        renderDashboard();
        expect(await screen.findByRole('heading', { name: 'Soweto run' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Fresh run' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Done run' })).not.toBeInTheDocument();

        const filters = screen.getByRole('group', { name: 'Filter trips' });
        expect(within(filters).getByRole('button', { name: 'Active 2' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(filters).getByRole('button', { name: 'Completed 1' }));
        expect(screen.getByRole('heading', { name: 'Done run' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Soweto run' })).not.toBeInTheDocument();
    });

    it('shows progress from the site counts', async () => {
        teamValue = manager;
        renderDashboard();
        expect(await screen.findByRole('progressbar', { name: 'Soweto run: 4 of 10 sites checked' })).toHaveAttribute('aria-valuenow', '4');
    });

    it('managers get an assignee picker and can delete any trip', async () => {
        teamValue = manager;
        renderDashboard();
        expect(await screen.findByRole('combobox', { name: 'Assign Fresh run' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete Fresh run' })).toBeInTheDocument();
    });

    it('agents see who a trip is assigned to, and can only delete their own', async () => {
        teamValue = agent;
        renderDashboard();
        await screen.findByRole('heading', { name: 'Soweto run' });
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.getByText('agent@x.co')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete Soweto run' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete Fresh run' })).not.toBeInTheDocument();
    });

    it('deletes only after confirming in the dialog', async () => {
        teamValue = manager;
        renderDashboard();
        fireEvent.click(await screen.findByRole('button', { name: 'Delete Fresh run' }));

        const dialog = await screen.findByRole('dialog', { name: 'Delete this trip?' });
        expect(dialog).toHaveTextContent('"Fresh run" and its 5 sites');
        expect(deleteTrip).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete trip' }));
        await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith('t3'));
        await waitFor(() => expect(screen.queryByRole('heading', { name: 'Fresh run' })).not.toBeInTheDocument());
    });

    it('guides new users with an empty state', async () => {
        teamValue = agent;
        fetchTripsWithProgress.mockResolvedValue([]);
        renderDashboard();
        expect(await screen.findByRole('heading', { name: 'Nothing assigned to you yet' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create a trip' })).toBeInTheDocument();
    });

    it('shows an error instead of an empty list when loading fails', async () => {
        teamValue = manager;
        fetchTripsWithProgress.mockRejectedValue(new Error('offline'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        renderDashboard();
        expect(await screen.findByText("Trips couldn't be loaded")).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'No trips yet' })).not.toBeInTheDocument();
    });
});
