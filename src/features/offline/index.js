import { createStore, entries, set, del } from 'idb-keyval';
import { createOutbox, memoryStorage } from './outbox';
import { updateSite, uploadSitePhoto } from '../sites/siteRepository';
import { updateTrip } from '../trips/tripRepository';

const idbStorage = () => {
    const store = createStore('routeops-outbox', 'entries');
    return {
        getAll: async () => (await entries(store)).map(([, value]) => value),
        set: (key, value) => set(key, value, store),
        del: (key) => del(key, store),
    };
};

/** The app's one outbox. Started by `useOutboxSync` (mounted in App). */
export const outbox = createOutbox({
    storage: typeof indexedDB === 'undefined' ? memoryStorage() : idbStorage(),
    handlers: {
        site: (id, fields) => updateSite(id, fields),
        trip: (id, fields) => updateTrip(id, fields),
        photo: (id, photo) => uploadSitePhoto(photo),
    },
});
