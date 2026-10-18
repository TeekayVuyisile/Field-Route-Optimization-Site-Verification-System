import { cn } from './cn';

/**
 * Brand mark: a route line between a start and an end stop. Drawn as SVG so
 * it stays crisp at any size and matches public/favicon.svg.
 */
export const LogoMark = ({ className }) => (
    <span className={cn('grid size-9 place-items-center rounded-xl bg-accent text-accent-fg shadow-card', className)} aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M5 18c2.5-6 6-1.5 8-6s3.5-5 6-6" />
            <circle cx="5" cy="18" r="2" fill="currentColor" stroke="none" />
            <circle cx="19" cy="6" r="2" fill="currentColor" stroke="none" />
        </svg>
    </span>
);

const Logo = ({ className, markClassName }) => (
    <span className={cn('inline-flex items-center gap-2.5 font-bold tracking-tight text-fg', className)}>
        <LogoMark className={markClassName} />
        <span className="text-lg">RouteOps</span>
    </span>
);

export default Logo;
