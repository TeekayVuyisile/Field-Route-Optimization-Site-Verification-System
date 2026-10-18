import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const fetchTripWithSites = vi.fn();
vi.mock('../features/trips/tripRepository', () => ({ fetchTripWithSites: (...a) => fetchTripWithSites(...a) }));
const photoRepo = { fetchSitePhotos: vi.fn(), deleteSitePhoto: vi.fn(), downloadSitePhoto: vi.fn() };
vi.mock('../features/sites/siteRepository', () => ({
    fetchSitePhotos: (...a) => photoRepo.fetchSitePhotos(...a),
    deleteSitePhoto: (...a) => photoRepo.deleteSitePhoto(...a),
    downloadSitePhoto: (...a) => photoRepo.downloadSitePhoto(...a),
}));

const { default: TripReview } = await import('./TripReview');
const { default: useTripStore } = await import('../store/useTripStore');

const TRIP = { id: 't1', title: 'Soweto run', status: 'in_progress', created_at: '2026-10-01T08:00:00Z' };
const SITES = [
    { id: 's1', name: 'Alpha tower', is_checked: true, notes: 'Gate locked, used side entrance', latitude: -26.1, longitude: 28.0 },
    { id: 's2', name: 'Bravo cabinet', is_checked: false, notes: '', latitude: -26.2, longitude: 28.1 },
    { id: 's4', name: 'Delta mast', is_checked: true, notes: '', latitude: -26.4, longitude: 28.3,
      checked_at: '2026-10-02T10:42:00Z', check_distance_m: 1240, check_flagged: true, check_note: 'Pin is at the depot' },
    { id: 's3', name: 'Charlie roof', is_checked: false, notes: null, latitude: -26.3, longitude: 28.2 },
];
const PHOTOS = [
    { id: 'p1', site_id: 's1', storage_path: 'u/s1/1.jpg', url: 'https://signed/1', created_at: '2026-10-02T09:00:00Z' },
    { id: 'p2', site_id: 's1', storage_path: 'u/s1/2.jpg', url: 'https://signed/2', created_at: '2026-10-02T09:05:00Z' },
];

const renderReport = () => render(
    <MemoryRouter initialEntries={['/trip-review/t1']}>
        <Routes>
            <Route path="/trip-review/:id" element={<TripReview />} />
            <Route path="/map/:tripId" element={<p>map page</p>} />
        </Routes>
    </MemoryRouter>
);

const log = () => screen.getByRole('region', { name: 'Verification log' });

describe('TripReview', () => {
    beforeEach(() => {
        fetchTripWithSites.mockReset().mockResolvedValue({ trip: TRIP, sites: SITES });
        photoRepo.fetchSitePhotos.mockReset().mockResolvedValue({ photos: PHOTOS, urlsFailed: false });
        photoRepo.deleteSitePhoto.mockReset().mockResolvedValue(undefined);
    });

    it('summarises completion and lists every site with notes', async () => {
        renderReport();
        expect(await screen.findByRole('heading', { name: 'Soweto run' })).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
        expect(within(log()).getAllByRole('listitem')).toHaveLength(4);
        expect(screen.getByText('Gate locked, used side entrance')).toBeInTheDocument();
        expect(photoRepo.fetchSitePhotos).toHaveBeenCalledWith(['s1', 's2', 's4', 's3']);
    });

    it('searches names and notes, and filters by status', async () => {
        renderReport();
        await screen.findByRole('heading', { name: 'Soweto run' });

        fireEvent.change(screen.getByLabelText('Search sites or notes'), { target: { value: 'side entrance' } });
        expect(within(log()).getAllByRole('listitem')).toHaveLength(1);

        fireEvent.change(screen.getByLabelText('Search sites or notes'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /Not visited/ }));
        expect(within(log()).getAllByRole('listitem').map((li) => within(li).getByRole('heading').textContent))
            .toEqual(['Bravo cabinet', 'Charlie roof']);
    });

    it('shows flagged check-ins with distance and reason, and filters to them', async () => {
        renderReport();
        await screen.findByRole('heading', { name: 'Soweto run' });
        expect(screen.getByText('1 flagged')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Flagged/ }));
        const [row] = within(log()).getAllByRole('listitem');
        expect(within(row).getByRole('heading')).toHaveTextContent('Delta mast');
        expect(row).toHaveTextContent('1.2 km from the site');
        expect(row).toHaveTextContent('Reason: Pin is at the depot');
    });

    it("shows each site's checklist answers and calls out missing required ones", async () => {
        const checklist = { name: 'Audit', items: [
            { id: 'power', label: 'Power on', type: 'check', required: true },
            { id: 'ssid', label: 'SSID seen', type: 'text', required: true },
        ] };
        fetchTripWithSites.mockResolvedValue({
            trip: { ...TRIP, checklist },
            sites: [{ ...SITES[0], checklist_answers: { power: true } }],
        });
        renderReport();
        const [row] = within(await screen.findByRole('region', { name: 'Verification log' })).getAllByRole('listitem');
        expect(row).toHaveTextContent('Power onYes');
        expect(row).toHaveTextContent('SSID seenMissing');
    });

    it('opens the map with this trip loaded', async () => {
        renderReport();
        fireEvent.click(await screen.findByRole('button', { name: 'Open map' }));
        expect(await screen.findByText('map page')).toBeInTheDocument();
        expect(useTripStore.getState().currentTrip.id).toBe('t1');
    });

    it('exports a CSV named after the trip', async () => {
        const createObjectURL = vi.fn(() => 'blob:x');
        globalThis.URL.createObjectURL = createObjectURL;
        globalThis.URL.revokeObjectURL = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
            expect(this.download).toBe('Soweto-run-report.csv');
        });
        renderReport();
        fireEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));

        expect(click).toHaveBeenCalled();
        const csv = await createObjectURL.mock.calls[0][0].text();
        expect(csv).toContain('1,"Alpha tower","Visited","Gate locked, used side entrance",-26.1,28,2');
        click.mockRestore();
    });

    it('views photos and deletes one only after confirming', async () => {
        renderReport();
        fireEvent.click(await screen.findByRole('button', { name: 'View photo 2 of Alpha tower' }));
        const viewer = await screen.findByRole('dialog', { name: 'Alpha tower' });
        expect(within(viewer).getByText(/Photo 2 of 2/)).toBeInTheDocument();

        fireEvent.click(within(viewer).getByRole('button', { name: 'Delete' }));
        expect(photoRepo.deleteSitePhoto).not.toHaveBeenCalled();
        fireEvent.click(within(viewer).getByRole('button', { name: 'Delete photo' }));

        await waitFor(() => expect(photoRepo.deleteSitePhoto).toHaveBeenCalledWith(PHOTOS[1]));
        expect(await within(viewer).findByText(/Photo 1 of 1/)).toBeInTheDocument();
        expect(screen.getByText('Photos').parentElement).toHaveTextContent('Photos1');
    });

    it('offers a retry when the trip cannot be loaded', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchTripWithSites.mockRejectedValueOnce(new Error('offline'));
        renderReport();
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
        expect(await screen.findByRole('heading', { name: 'Soweto run' })).toBeInTheDocument();
    });
});
