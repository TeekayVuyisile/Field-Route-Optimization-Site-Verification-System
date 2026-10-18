import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let teamValue;
const authValue = { user: { id: 'me' } };
vi.mock('../context/useAuth', () => ({ useAuth: () => authValue }));
vi.mock('../context/useTeam', () => ({ useTeam: () => teamValue }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
// Leaflet needs a real layout engine; the preview is covered by eye, not jsdom
vi.mock('../components/trips/SitesPreviewMap', () => ({ default: ({ sites }) => <div>map of {sites.length} sites</div> }));

const createTripWithSites = vi.fn();
const updateTrip = vi.fn();
vi.mock('../features/trips/tripRepository', () => ({
    createTripWithSites: (...a) => createTripWithSites(...a),
    updateTrip: (...a) => updateTrip(...a),
}));
vi.mock('../features/team/teamRepository', () => ({
    fetchTeamMembers: async () => [{ user_id: 'me', email: 'me@x.co' }, { user_id: 'agent', email: 'agent@x.co' }],
}));

const { default: CreateTrip } = await import('./CreateTrip');
const { default: useTripStore } = await import('../store/useTripStore');

const renderWizard = () => render(
    <MemoryRouter initialEntries={['/create-trip']}>
        <Routes>
            <Route path="/create-trip" element={<CreateTrip />} />
            <Route path="/map/:id" element={<p>map page</p>} />
        </Routes>
    </MemoryRouter>
);

const addSiteByHand = async (name, lat, lng) => {
    const dialog = await screen.findByRole('dialog', { name: 'Add a site' });
    fireEvent.change(within(dialog).getByLabelText('Site name'), { target: { value: name } });
    fireEvent.change(within(dialog).getByLabelText('Latitude'), { target: { value: lat } });
    fireEvent.change(within(dialog).getByLabelText('Longitude'), { target: { value: lng } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add site' }));
};

describe('New trip wizard', () => {
    beforeEach(() => {
        useTripStore.getState().clearStore();
        teamValue = { isManager: true };
        createTripWithSites.mockReset().mockResolvedValue({
            trip: { id: 't1', title: 'Audit', status: 'draft' },
            sites: [{ id: 's1', name: 'Tower 1' }]
        });
        updateTrip.mockReset().mockResolvedValue({ id: 't1', title: 'Audit', status: 'assigned', assigned_to: 'agent' });
    });

    it('needs a trip name before adding sites', () => {
        renderWizard();
        fireEvent.click(screen.getByRole('button', { name: /Add sites by hand/ }));
        expect(screen.getByText('Name the trip so your team can find it.')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('adds a site by hand (DMS input), reviews, assigns and saves', async () => {
        renderWizard();
        fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Audit' } });
        fireEvent.click(screen.getByRole('button', { name: /Add sites by hand/ }));
        await addSiteByHand('Tower 1', `26°12'15"S`, '28,0473');

        expect(await screen.findByText('map of 1 sites')).toBeInTheDocument();
        expect(screen.getByText('1 ready')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

        const assign = await screen.findByLabelText('Assign to');
        await waitFor(() => expect(within(assign).getByRole('option', { name: 'agent@x.co' })).toBeInTheDocument());
        fireEvent.change(assign, { target: { value: 'agent' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save and open map' }));

        await waitFor(() => expect(screen.getByText('map page')).toBeInTheDocument());
        const [title, sites] = createTripWithSites.mock.calls[0];
        expect(title).toBe('Audit');
        expect(sites[0]).toMatchObject({ name: 'Tower 1', longitude: 28.0473 });
        expect(sites[0].latitude).toBeCloseTo(-26.204167, 5);
        expect(updateTrip).toHaveBeenCalledWith('t1', { assigned_to: 'agent', status: 'assigned' });
        // The store now holds the persisted trip, so the map syncs real ids
        expect(useTripStore.getState().currentTrip.id).toBe('t1');
    });

    it('imports a CSV with guessed columns and blocks continuing on unreadable rows', async () => {
        renderWizard();
        fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Import' } });
        const csv = new File(['Site Name;Latitude;Longitude\nA;-26,2;28,0\nB;oops;28,1\n'], 'sites.csv', { type: 'text/csv' });
        fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [csv] } });

        expect(await screen.findByText('Match your columns')).toBeInTheDocument();
        expect(screen.getByLabelText('Latitude')).toHaveValue('Latitude');
        expect(screen.getByLabelText('Longitude')).toHaveValue('Longitude');
        fireEvent.click(screen.getByRole('button', { name: /Import 2 sites/ }));

        expect(await screen.findByText('1 unreadable')).toBeInTheDocument();
        expect(screen.getByText('oops, 28.10000')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Remove B' }));
        expect(screen.getByRole('button', { name: /Continue/ })).toBeEnabled();
    });

    it('agents save without an assignee picker', async () => {
        teamValue = { isManager: false };
        renderWizard();
        fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Mine' } });
        fireEvent.click(screen.getByRole('button', { name: /Add sites by hand/ }));
        await addSiteByHand('Tower 1', '-26.2', '28.0');
        fireEvent.click(await screen.findByRole('button', { name: /Continue/ }));
        await screen.findByRole('button', { name: 'Save and open map' });
        expect(screen.queryByLabelText('Assign to')).not.toBeInTheDocument();
    });

    it('never offers to re-save a trip that is already saved', () => {
        useTripStore.getState().loadTrip({ id: 'saved', title: 'Old trip' }, [{ id: 'db-1', name: 'x', latitude: -26, longitude: 28 }]);
        renderWizard();
        expect(screen.getByLabelText('Trip name')).toHaveValue('');
        expect(screen.queryByText('Review')).toBeInTheDocument(); // stepper label only
        expect(screen.queryByRole('button', { name: 'Save and open map' })).not.toBeInTheDocument();
        expect(useTripStore.getState().currentTrip).toBeNull();
    });

    it('resumes a staged draft (e.g. after a refresh) at review', async () => {
        useTripStore.getState().setCurrentTrip({ title: 'Draft' });
        useTripStore.getState().setSites([{ id: 'local-1', name: 'Kept', latitude: -26, longitude: 28, isValid: true }]);
        renderWizard();
        expect(await screen.findByText('Kept')).toBeInTheDocument();
        expect(screen.getByText('map of 1 sites')).toBeInTheDocument();
    });
});
