import { useId, useState } from 'react';
import dayjs from 'dayjs';
import { LuCamera, LuCheck, LuCircleAlert, LuNavigation, LuNotebookPen, LuPencil, LuTrash2, LuUndo2 } from 'react-icons/lu';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import { Badge } from '../ui/primitives';
import { cn } from '../ui/cn';
import { formatDistance } from '../../lib/format';
import PhotoStrip from './PhotoStrip';

const tile = 'flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface text-xs font-semibold text-fg transition-colors duration-200 hover:bg-surface-2';

/** Opens the phone's maps app with driving directions to the site */
const directionsUrl = (site) =>
    `https://www.google.com/maps/dir/?api=1&destination=${site.latitude},${site.longitude}&travelmode=driving`;

// How the check-in went: when, how far from the site, and whether it's
// flagged for the manager (beyond the team radius, or no location)
const CheckInSummary = ({ site }) => {
    const when = site.checked_at ? dayjs(site.checked_at).format('HH:mm') : null;
    const where = site.check_distance_m != null ? `${formatDistance(site.check_distance_m)} from the site` : null;
    const text = [when && `Checked in ${when}`, where].filter(Boolean).join(' · ') || 'Checked in';

    return site.check_flagged ? (
        <div className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning" role="status">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
                <span className="font-semibold">{where ? text : `${text} · no location`}. Flagged for review.</span>
                {site.check_note && <span className="block text-fg">"{site.check_note}"</span>}
            </p>
        </div>
    ) : (
        <p className="flex items-center gap-2 text-sm text-success" role="status">
            <LuCheck className="size-4" aria-hidden /> {text}
        </p>
    );
};

/**
 * The selected stop (the next one by default) with the actions a driver
 * needs on arrival. Big targets: this is used one-handed, often in a car.
 */
const StopCard = ({ site, number, total, isNext, distance, preparingPhoto, photos = [], queuedPhotos = [], onOpenPhoto, onToggleChecked, onPhoto, onNotesChange, onEdit, onDelete }) => {
    // Render with key={site.id}: notes start open when the site has some
    const [showNotes, setShowNotes] = useState(() => Boolean(site.notes));
    const notesId = useId();

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        {site.is_checked
                            ? <Badge tone="success">Visited</Badge>
                            : isNext ? <Badge tone="accent">Next stop</Badge> : null}
                        <span className="text-xs font-semibold text-faint">Stop {number} of {total}</span>
                    </div>
                    <h2 className="mt-1 truncate text-lg font-bold">{site.name}</h2>
                    <p className="text-sm text-muted">
                        {distance != null && <><span className="font-semibold text-fg">{formatDistance(distance)} away</span> · </>}
                        <span className="font-mono text-xs">{site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}</span>
                    </p>
                </div>
                <div className="-mr-2 flex shrink-0">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${site.name}`} onClick={onEdit}>
                        <LuPencil className="size-4" />
                    </Button>
                    <Button variant="danger-ghost" size="icon" aria-label={`Remove ${site.name}`} onClick={onDelete}>
                        <LuTrash2 className="size-4" />
                    </Button>
                </div>
            </div>

            {site.is_checked && <CheckInSummary site={site} />}

            <div className="grid grid-cols-3 gap-2">
                <a href={directionsUrl(site)} target="_blank" rel="noopener noreferrer" className={tile}>
                    <LuNavigation className="size-5 text-accent" aria-hidden /> Navigate
                </a>
                <label className={cn(tile, 'focus-within:ring-4 focus-within:ring-accent-soft', preparingPhoto && 'pointer-events-none opacity-60')}>
                    {preparingPhoto ? <Spinner className="size-5" label="Saving photo" /> : <LuCamera className="size-5 text-accent" aria-hidden />}
                    {preparingPhoto ? 'Saving' : 'Photo'}
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        aria-label={`Add photo for ${site.name}`}
                        disabled={preparingPhoto}
                        onChange={(e) => { onPhoto(e.target.files[0]); e.target.value = ''; }}
                    />
                </label>
                <button
                    type="button"
                    className={cn(tile, showNotes && 'border-accent bg-accent-soft')}
                    aria-expanded={showNotes}
                    aria-controls={notesId}
                    onClick={() => setShowNotes(!showNotes)}
                >
                    <LuNotebookPen className="size-5 text-accent" aria-hidden /> Notes
                </button>
            </div>

            <PhotoStrip siteName={site.name} photos={photos} queued={queuedPhotos} onOpen={onOpenPhoto} />

            {showNotes && (
                <textarea
                    id={notesId}
                    rows={3}
                    value={site.notes || ''}
                    onChange={(e) => onNotesChange(e.target.value)}
                    placeholder="Access codes, contact on site, what you found..."
                    aria-label={`Notes for ${site.name}`}
                    className="block w-full resize-none rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-base text-fg placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
                />
            )}

            {site.is_checked ? (
                <Button variant="secondary" size="lg" className="w-full" onClick={onToggleChecked}>
                    <LuUndo2 className="size-5" aria-hidden /> Undo check-in
                </Button>
            ) : (
                <Button size="lg" className="w-full" onClick={onToggleChecked}>
                    <LuCheck className="size-5" aria-hidden /> Check in
                </Button>
            )}
        </div>
    );
};

export default StopCard;
