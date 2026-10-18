import { LuCheck } from 'react-icons/lu';
import { cn } from '../ui/cn';

/** Every stop in visiting order; picking one shows it in the stop card. */
const SiteList = ({ sites, nextId, selectedId, onSelect }) => (
    <ol className="divide-y divide-border" aria-label="Stops in visiting order">
        {sites.map((site, index) => {
            const isNext = site.id === nextId;
            const selected = site.id === selectedId;
            return (
                <li key={site.id}>
                    <button
                        type="button"
                        onClick={() => onSelect(site.id)}
                        aria-current={selected || undefined}
                        className={cn(
                            'flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors duration-200',
                            selected ? 'bg-accent-soft' : 'hover:bg-surface-2'
                        )}
                    >
                        <span
                            className={cn(
                                'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                                site.is_checked ? 'bg-success-soft text-success' : isNext ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'
                            )}
                        >
                            {site.is_checked ? <LuCheck className="size-4" aria-label="Visited" /> : index + 1}
                        </span>
                        <span className={cn('min-w-0 flex-1 truncate', site.is_checked ? 'text-faint line-through' : 'font-semibold')}>
                            {site.name}
                        </span>
                        {isNext && <span className="shrink-0 text-xs font-semibold text-accent">Next</span>}
                    </button>
                </li>
            );
        })}
    </ol>
);

export default SiteList;
