import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

const updateSite = vi.fn();
vi.mock('../../features/sites/siteRepository', () => ({ updateSite: (...a) => updateSite(...a), uploadSitePhoto: vi.fn() }));
vi.mock('../../features/trips/tripRepository', () => ({ updateTrip: vi.fn() }));

const { outbox } = await import('../../features/offline');
const { default: SyncStatus } = await import('./SyncStatus');
const { default: useTripStore } = await import('../../store/useTripStore');

const setOnline = (value) => {
    Object.defineProperty(navigator, 'onLine', { value, configurable: true });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

describe('SyncStatus', () => {
    beforeEach(() => {
        useTripStore.getState().loadTrip({ id: 't1', title: 'Run' }, [{ id: 's1', name: 'Alpha tower', latitude: -26, longitude: 28 }]);
        updateSite.mockReset().mockResolvedValue(undefined);
        outbox.setUser('me');
    });
    afterEach(async () => {
        act(() => setOnline(true));
        for (const entry of outbox.getSnapshot().failed) await outbox.discard(entry.key);
        await outbox.discard('site:s1');
    });

    it('stays out of the way when everything is saved', () => {
        const { container } = render(<SyncStatus />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows offline work waiting and explains it', async () => {
        setOnline(false);
        render(<SyncStatus />);
        act(() => outbox.update('site', 's1', { notes: 'Gate locked' }));

        fireEvent.click(screen.getByRole('button', { name: 'Sync status: Offline · 1' }));
        const dialog = await screen.findByRole('dialog', { name: "You're offline" });
        expect(within(dialog).getByText('1 change waiting')).toBeInTheDocument();
    });

    it('lists a refused change with retry and discard', async () => {
        updateSite.mockRejectedValue(Object.assign(new Error('permission denied'), { code: '42501' }));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<SyncStatus />);
        act(() => outbox.update('site', 's1', { notes: 'x' }, { immediate: true }));

        fireEvent.click(await screen.findByRole('button', { name: 'Sync status: 1 not saved' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Changes to Alpha tower')).toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
        await waitFor(() => expect(outbox.getSnapshot().failed).toEqual([]));
    });
});
