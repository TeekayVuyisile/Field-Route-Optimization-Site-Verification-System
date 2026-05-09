import { create } from 'zustand';

const useTripStore = create((set) => ({
    currentTrip: null,
    sites: [],
    
    setCurrentTrip: (trip) => set({ currentTrip: trip }),
    setSites: (sites) => set({ sites: sites }),
    
    updateSite: (index, updatedSite) => set((state) => {
        const newSites = [...state.sites];
        newSites[index] = { ...newSites[index], ...updatedSite };
        return { sites: newSites };
    }),
    
    removeSite: (index) => set((state) => ({
        sites: state.sites.filter((_, i) => i !== index)
    })),
    
    clearStore: () => set({ currentTrip: null, sites: [] }),
}));

export default useTripStore;
