import { LogoMark } from './Logo';
import Spinner from './Spinner';

/** Shown while the first auth check runs (replaces a blank white screen). */
export const FullScreenLoader = () => (
    <div className="ui grid min-h-dvh place-items-center bg-canvas">
        <div className="flex flex-col items-center gap-4 text-muted">
            <LogoMark className="size-12 rounded-2xl" />
            <Spinner className="size-5" label="Starting RouteOps" />
        </div>
    </div>
);

/** Suspense fallback while a lazily loaded page downloads. */
export const PageLoader = () => (
    <div className="ui grid min-h-[50dvh] place-items-center text-muted">
        <Spinner className="size-6" label="Loading page" />
    </div>
);
