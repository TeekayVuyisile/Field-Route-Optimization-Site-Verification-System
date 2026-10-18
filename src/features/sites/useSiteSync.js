import { useEffect, useState } from 'react';
import { createSiteSyncQueue } from './siteSyncQueue';
import { updateSite } from './siteRepository';

const STATUS_LABELS = {
    pending: 'Unsaved changes',
    saving: 'Saving...',
    saved: 'Saved',
    error: 'Save failed, retrying...'
};

/**
 * Debounced, per-site Supabase sync for map edits (notes, checked state).
 * Pending changes are flushed when the tab is hidden or closed and when the
 * component unmounts (route change), so leaving the page never drops edits.
 */
export const useSiteSync = () => {
    const [status, setStatus] = useState('');

    const [queue] = useState(() => createSiteSyncQueue({
        save: updateSite,
        onStatus: (s) => setStatus(STATUS_LABELS[s])
    }));

    // "Saved" is a transient confirmation
    useEffect(() => {
        if (status !== STATUS_LABELS.saved) return;
        const t = setTimeout(() => setStatus(''), 2000);
        return () => clearTimeout(t);
    }, [status]);

    useEffect(() => {
        const flushIfHidden = () => {
            if (document.visibilityState === 'hidden') queue.flushAll();
        };
        const flushNow = () => queue.flushAll();

        document.addEventListener('visibilitychange', flushIfHidden);
        window.addEventListener('pagehide', flushNow);
        return () => {
            document.removeEventListener('visibilitychange', flushIfHidden);
            window.removeEventListener('pagehide', flushNow);
            queue.flushAll();
        };
    }, [queue]);

    return {
        status,
        queueSiteUpdate: queue.queue,
        flushSite: queue.flush
    };
};
