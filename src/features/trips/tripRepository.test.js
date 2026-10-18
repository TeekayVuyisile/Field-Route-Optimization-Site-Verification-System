import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
// Chainable query-builder stand-in: awaiting it yields `queryResult`
let queryResult;
const queryCalls = [];
const builder = new Proxy({}, {
    get(_, prop) {
        if (prop === 'then') return (resolve) => resolve(queryResult);
        return (...args) => { queryCalls.push([prop, ...args]); return builder; };
    }
});
vi.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...args) => rpc(...args), from: (table) => { queryCalls.push(['from', table]); return builder; } }
}));

const { createTripWithSites, saveSiteOrder, fetchTripsWithProgress, deleteTrip } = await import('./tripRepository');

describe('fetchTripsWithProgress', () => {
    beforeEach(() => { queryCalls.length = 0; });

    it('asks the database for total and checked site counts in one request', async () => {
        queryResult = {
            data: [{ id: 't1', title: 'Run', site_total: [{ count: 44 }], site_done: [{ count: 25 }] }],
            error: null
        };
        expect(await fetchTripsWithProgress()).toEqual([{ id: 't1', title: 'Run', siteCount: 44, checkedCount: 25 }]);
        expect(queryCalls).toContainEqual(['select', '*, site_total:sites(count), site_done:sites(count)']);
        expect(queryCalls).toContainEqual(['eq', 'site_done.is_checked', true]);
    });

    it('treats missing counts as zero', async () => {
        queryResult = { data: [{ id: 't1', site_total: [], site_done: [] }], error: null };
        expect(await fetchTripsWithProgress()).toEqual([{ id: 't1', siteCount: 0, checkedCount: 0 }]);
    });
});

describe('deleteTrip', () => {
    it('reports an RLS-blocked delete instead of pretending it worked', async () => {
        queryResult = { data: [], error: null };
        await expect(deleteTrip('t1')).rejects.toThrow("can't delete");
        queryResult = { data: [{ id: 't1' }], error: null };
        await expect(deleteTrip('t1')).resolves.toBeUndefined();
    });
});

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
