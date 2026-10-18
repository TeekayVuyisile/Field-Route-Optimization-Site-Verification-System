import { describe, it, expect, beforeEach } from 'vitest';
import useTripStore from './useTripStore';

const STORAGE_KEY = 'routeops-active-trip';
const trip = { id: 't1', title: 'Soweto WiFi audit' };
const sites = [{ id: 's1', name: 'Tower 1' }, { id: 's2', name: 'Tower 2' }];

describe('useTripStore', () => {
    beforeEach(() => {
        useTripStore.getState().clearStore();
        localStorage.clear();
    });

    it('loadTrip sets the trip and its sites together', () => {
        useTripStore.getState().loadTrip(trip, sites);
        const state = useTripStore.getState();
        expect(state.currentTrip).toEqual(trip);
        expect(state.sites).toEqual(sites);
    });

    // Regression: a refresh used to drop the staged/active trip
    it('persists the trip and sites to localStorage', () => {
        useTripStore.getState().loadTrip(trip, sites);
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        expect(saved.state).toEqual({ currentTrip: trip, sites });
    });

    it('does not persist actions, only data', () => {
        useTripStore.getState().loadTrip(trip, sites);
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        expect(Object.keys(saved.state).sort()).toEqual(['currentTrip', 'sites']);
    });

    it('rehydrates from storage', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentTrip: trip, sites }, version: 1 }));
        await useTripStore.persist.rehydrate();
        expect(useTripStore.getState().currentTrip).toEqual(trip);
    });

    it('clearStore empties both memory and storage', () => {
        useTripStore.getState().loadTrip(trip, sites);
        useTripStore.getState().clearStore();
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        expect(saved.state).toEqual({ currentTrip: null, sites: [] });
    });

    it('updateSite merges fields into one site', () => {
        useTripStore.getState().loadTrip(trip, sites);
        useTripStore.getState().updateSite(1, { is_checked: true });
        expect(useTripStore.getState().sites[1]).toEqual({ id: 's2', name: 'Tower 2', is_checked: true });
    });
});
