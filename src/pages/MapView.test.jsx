import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authValue = { user: { id: 'me' } };
vi.mock('../context/useAuth', () => ({ useAuth: () => authValue }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const mapCalls = vi.hoisted(() => ({ fitBounds: vi.fn() }));
// Leaflet needs real layout; pins become buttons so tests can tap them
vi.mock('react-leaflet', () => {
    const map = { setView: () => {}, fitBounds: (...a) => mapCalls.fitBounds(...a), getZoom: () => 13, invalidateSize: () => {}, getContainer: () => document.createElement('div') };
    return {
        MapContainer: ({ children }) => <div>{children}</div>,
        TileLayer: () => null,
        GeoJSON: () => <p>route line</p>,
        Marker: ({ title, eventHandlers }) => (title ? <button type="button" onClick={eventHandlers?.click}>Pin {title}</button> : null),
        useMap: () => map,
        useMapEvents: () => map,
    };
});
vi.mock('../components/map/mapIcons', () => ({ sitePinIcon: () => ({}), userLocationIcon: {} }));
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };

let gpsPos;
vi.mock('../features/navigation/useGpsPosition', () => ({
    useGpsPosition: () => ({ userPos: gpsPos, refreshGPS: vi.fn() }),
}));

const getOptimizedRoute = vi.fn();
const getDirections = vi.fn();
vi.mock('../services/orsService', () => ({
    getOptimizedRoute: (...a) => getOptimizedRoute(...a),
    getDirections: (...a) => getDirections(...a),
}));

const siteRepo = { insertSite: vi.fn(), deleteSite: vi.fn(), updateSite: vi.fn(), uploadSitePhoto: vi.fn() };
vi.mock('../features/sites/siteRepository', () => ({
    insertSite: (...a) => siteRepo.insertSite(...a),
    deleteSite: (...a) => siteRepo.deleteSite(...a),
    updateSite: (...a) => siteRepo.updateSite(...a),
    uploadSitePhoto: (...a) => siteRepo.uploadSitePhoto(...a),
}));
const saveSiteOrder = vi.fn();
const updateTrip = vi.fn();
vi.mock('../features/trips/tripRepository', () => ({
    fetchTripWithSites: vi.fn(),
    saveSiteOrder: (...a) => saveSiteOrder(...a),
    updateTrip: (...a) => updateTrip(...a),
}));

const { default: MapView } = await import('./MapView');
const { default: useTripStore } = await import('../store/useTripStore');

const SITES = [
    { id: 's1', name: 'Alpha', latitude: -26.1, longitude: 28.0, is_checked: false, notes: '' },
    { id: 's2', name: 'Bravo', latitude: -26.2, longitude: 28.1, is_checked: false, notes: '' },
    { id: 's3', name: 'Charlie', latitude: -26.3, longitude: 28.2, is_checked: false, notes: '' },
];

const renderMap = () => render(
    <MemoryRouter initialEntries={['/map/t1']}>
        <Routes>
            <Route path="/map/:tripId" element={<MapView />} />
            <Route path="/dashboard" element={<p>dashboard</p>} />
        </Routes>
    </MemoryRouter>
);

const stopPanel = () => screen.getByRole('complementary', { name: 'Stops' });

describe('MapView (driver mode)', () => {
    beforeEach(() => {
        gpsPos = { lat: -26.0, lng: 28.0 };
        useTripStore.getState().loadTrip({ id: 't1', title: 'Soweto run', status: 'assigned' }, SITES.map((s) => ({ ...s })));
        Object.values(siteRepo).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
        updateTrip.mockReset().mockResolvedValue({});
        saveSiteOrder.mockReset().mockResolvedValue(undefined);
        getOptimizedRoute.mockReset();
        getDirections.mockReset();
    });

    it('explains when no trip is open', () => {
        useTripStore.getState().clearStore();
        render(<MemoryRouter><MapView /></MemoryRouter>);
        expect(screen.getByText('No trip open')).toBeInTheDocument();
    });

    it('opens framed on the stops, then follows the driver once navigation starts', async () => {
        getOptimizedRoute.mockResolvedValue(SITES);
        getDirections.mockRejectedValue(new Error('down'));
        mapCalls.fitBounds.mockClear();
        renderMap();
        expect(mapCalls.fitBounds).toHaveBeenCalledWith([[-26.1, 28.0], [-26.2, 28.1], [-26.3, 28.2]], expect.anything());
        expect(screen.getByRole('button', { name: 'Follow my location' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Optimize' }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Follow my location' })).not.toBeInTheDocument());
    });

    it('shows the first unvisited stop and switches stops from the list or a pin', () => {
        renderMap();
        expect(within(stopPanel()).getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
        expect(screen.getByText('0 of 3 stops visited')).toBeInTheDocument();

        fireEvent.click(within(screen.getByRole('list', { name: 'Stops in visiting order' })).getByRole('button', { name: /Charlie/ }));
        expect(within(stopPanel()).getByRole('heading', { name: 'Charlie' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Pin Bravo' }));
        expect(within(stopPanel()).getByRole('heading', { name: 'Bravo' })).toBeInTheDocument();
    });

    it('checks in, saves at once, starts the trip and moves on to the next stop', async () => {
        renderMap();
        fireEvent.click(screen.getByRole('button', { name: 'Check in' }));

        await waitFor(() => expect(siteRepo.updateSite).toHaveBeenCalledWith('s1', { is_checked: true }));
        expect(updateTrip).toHaveBeenCalledWith('t1', { status: 'in_progress' });
        expect(within(stopPanel()).getByRole('heading', { name: 'Bravo' })).toBeInTheDocument();
        expect(screen.getByText('1 of 3 stops visited')).toBeInTheDocument();
    });

    it('removes a site only after confirming', async () => {
        renderMap();
        fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
        const dialog = await screen.findByRole('dialog', { name: 'Remove Alpha?' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove site' }));

        await waitFor(() => expect(siteRepo.deleteSite).toHaveBeenCalledWith('s1'));
        expect(useTripStore.getState().sites.map((s) => s.id)).toEqual(['s2', 's3']);
    });

    it('adds a site to the saved trip', async () => {
        siteRepo.insertSite.mockResolvedValue({ id: 's4', name: 'Delta', latitude: -26.4, longitude: 28.3, is_checked: false });
        renderMap();
        fireEvent.click(screen.getByRole('button', { name: 'Add a site' }));
        const dialog = await screen.findByRole('dialog', { name: 'Add a site' });
        fireEvent.change(within(dialog).getByLabelText('Site name'), { target: { value: 'Delta' } });
        fireEvent.change(within(dialog).getByLabelText('Latitude'), { target: { value: '-26,4' } });
        fireEvent.change(within(dialog).getByLabelText('Longitude'), { target: { value: '28.3' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Add site' }));

        await waitFor(() => expect(screen.getByText('0 of 4 stops visited')).toBeInTheDocument());
        expect(siteRepo.insertSite).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Delta', latitude: -26.4 }), 3);
    });

    it('optimizes, saves the order and shows turn-by-turn guidance', async () => {
        getOptimizedRoute.mockResolvedValue([SITES[2], SITES[0], SITES[1]]);
        getDirections.mockResolvedValue({
            type: 'FeatureCollection',
            features: [{
                geometry: { type: 'LineString', coordinates: [[28.0, -26.0], [28.2, -26.3]] },
                properties: { segments: [{ steps: [{ instruction: 'Turn left onto Main Rd', distance: 420, type: 0, way_points: [0, 1] }] }] },
            }],
        });
        renderMap();
        fireEvent.click(screen.getByRole('button', { name: 'Optimize' }));

        expect(await screen.findByText('Turn left onto Main Rd')).toBeInTheDocument();
        expect(saveSiteOrder).toHaveBeenCalledWith(['s3', 's1', 's2']);
        expect(within(stopPanel()).getByRole('heading', { name: 'Charlie' })).toBeInTheDocument();
        expect(within(stopPanel()).getByText('Next stop')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Re-route' })).toBeInTheDocument();
    });

    it('falls back to straight lines when directions are unavailable', async () => {
        getOptimizedRoute.mockResolvedValue(SITES);
        getDirections.mockRejectedValue(new Error('upstream 502'));
        renderMap();
        fireEvent.click(screen.getByRole('button', { name: 'Optimize' }));

        expect(await screen.findByText(/Straight lines only/)).toBeInTheDocument();
    });

    it('waits for a location before optimizing', () => {
        gpsPos = null;
        renderMap();
        expect(screen.getByRole('button', { name: 'Optimize' })).toBeDisabled();
        expect(screen.getByText('Finding your location...')).toBeInTheDocument();
    });

    it('offers the report once every stop is visited', () => {
        useTripStore.getState().loadTrip({ id: 't1', title: 'Done', status: 'completed' }, SITES.map((s) => ({ ...s, is_checked: true })));
        renderMap();
        expect(screen.getByText('Every stop visited')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View trip report' })).toHaveAttribute('href', '/trip-review/t1');
        expect(screen.queryByRole('button', { name: 'Optimize' })).not.toBeInTheDocument();
    });
});
