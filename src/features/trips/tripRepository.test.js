import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args) => rpc(...args) } }));

const { createTripWithSites, saveSiteOrder } = await import('./tripRepository');

describe('createTripWithSites', () => {
    beforeEach(() => rpc.mockReset());

    it('sends only the columns the database needs, in visiting order', async () => {
        rpc.mockResolvedValue({ data: { trip: { id: 't1' }, sites: [] }, error: null });
        await createTripWithSites('Audit', [
            { id: 'local-1', name: 'A', latitude: -26.1, longitude: 28.1, isValid: true, isInverted: false },
            { id: 'local-2', name: 'B', latitude: -26.2, longitude: 28.2, notes: 'gate code 1234' },
        ]);

        expect(rpc).toHaveBeenCalledWith('create_trip_with_sites', {
            p_title: 'Audit',
            p_sites: [
                { name: 'A', latitude: -26.1, longitude: 28.1, notes: '' },
                { name: 'B', latitude: -26.2, longitude: 28.2, notes: 'gate code 1234' },
            ]
        });
    });

    it('returns the persisted trip and sites with real ids', async () => {
        const saved = { trip: { id: 't1', title: 'Audit' }, sites: [{ id: 'db-uuid', name: 'A' }] };
        rpc.mockResolvedValue({ data: saved, error: null });
        expect(await createTripWithSites('Audit', [{ name: 'A', latitude: -26, longitude: 28 }])).toEqual(saved);
    });

    it('throws the database error so nothing is half-saved silently', async () => {
        rpc.mockResolvedValue({ data: null, error: new Error('RLS violation') });
        await expect(createTripWithSites('Audit', [{ name: 'A', latitude: -26, longitude: 28 }])).rejects.toThrow('RLS violation');
    });
});

describe('saveSiteOrder', () => {
    beforeEach(() => rpc.mockReset());

    it('passes ids in visiting order', async () => {
        rpc.mockResolvedValue({ error: null });
        await saveSiteOrder(['c', 'a', 'b']);
        expect(rpc).toHaveBeenCalledWith('set_site_order', { p_site_ids: ['c', 'a', 'b'] });
    });

    it('throws on failure', async () => {
        rpc.mockResolvedValue({ error: new Error('offline') });
        await expect(saveSiteOrder(['a'])).rejects.toThrow('offline');
    });
});
