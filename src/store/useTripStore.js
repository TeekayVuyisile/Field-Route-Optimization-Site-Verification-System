import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { outbox } from '../features/offline';

// Persisted to localStorage so a page refresh (or the phone killing the tab)
// doesn't throw away a staged trip or the active trip. localStorage is
// synchronous, so the store is already populated on the first render.
const useTripStore = create(persist((set) => ({
    currentTrip: null,
    sites: [],

    setCurrentTrip: (trip) => set({ currentTrip: trip }),
    setSites: (sites) => set({ sites: sites }),
    // Swap in a whole trip at once, so no render ever sees one trip's sites
    // under another trip. Edits still waiting in the outbox are laid over the
    // server's copy, so reopening a trip offline never undoes a check-in.
    loadTrip: (trip, sites) => set({
        currentTrip: trip && { ...trip, ...outbox.pendingFields('trip', trip.id) },
        sites: sites.map((site) => ({ ...site, ...outbox.pendingFields('site', site.id) })),
    }),

    updateSite: (index, updatedSite) => set((state) => {
        const newSites = [...state.sites];
        newSites[index] = { ...newSites[index], ...updatedSite };
        return { sites: newSites };
    }),

    removeSite: (index) => set((state) => ({
        sites: state.sites.filter((_, i) => i !== index)
    })),

    clearStore: () => set({ currentTrip: null, sites: [] }),
}), {
    name: 'routeops-active-trip',
    version: 1,
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ currentTrip: state.currentTrip, sites: state.sites }),
}));

// Another tab saved the store: take its copy instead of later overwriting it
// with this tab's stale one
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key === useTripStore.persist.getOptions().name) useTripStore.persist.rehydrate();
    });
}

export default useTripStore;
