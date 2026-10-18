import { useEffect, useSyncExternalStore } from 'react';
import { outbox } from './index';

/** Live outbox counts: { pending, photos, failed, syncing } */
export const useOutboxStatus = () => useSyncExternalStore(outbox.subscribe, outbox.getSnapshot);

const subscribeOnline = (fn) => {
    window.addEventListener('online', fn);
    window.addEventListener('offline', fn);
    return () => {
        window.removeEventListener('online', fn);
        window.removeEventListener('offline', fn);
    };
};

export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine);

/**
 * Starts the outbox once and sends queued work whenever there's a good
 * moment: signal comes back, the app returns to the foreground, or (as a
 * safety net) every 30s while something is waiting.
 */
export const useOutboxSync = () => {
    useEffect(() => {
        outbox.start();
        // Also on hide: a hidden tab may be frozen or killed next
        const drain = () => outbox.drain();
        const timer = setInterval(() => { if (outbox.getSnapshot().pending > 0) drain(); }, 30000);

        window.addEventListener('online', drain);
        document.addEventListener('visibilitychange', drain);
        return () => {
            clearInterval(timer);
            window.removeEventListener('online', drain);
            document.removeEventListener('visibilitychange', drain);
        };
    }, []);
};
