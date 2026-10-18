import { useRegisterSW } from 'virtual:pwa-register/react';
import { LuRefreshCw } from 'react-icons/lu';
import Button from '../ui/Button';

// Check for a new version hourly while the app stays open (drivers may keep
// it open all day)
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Offers a new version instead of reloading on its own: a silent reload in
 * the middle of navigation would drop the route and guidance state.
 */
const UpdatePrompt = () => {
    const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
        onRegisteredSW(url, registration) {
            if (registration) setInterval(() => registration.update(), CHECK_EVERY_MS);
        },
    });

    if (!needRefresh) return null;

    return (
        <div
            role="status"
            className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface p-3 pl-4 shadow-overlay md:bottom-6"
        >
            <LuRefreshCw className="size-5 shrink-0 text-accent" aria-hidden />
            <p className="min-w-0 flex-1 text-sm font-semibold">A new version of RouteOps is ready.</p>
            <Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>Later</Button>
            <Button size="sm" onClick={() => updateServiceWorker(true)}>Update</Button>
        </div>
    );
};

export default UpdatePrompt;
