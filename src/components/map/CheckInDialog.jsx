import { useId, useState } from 'react';
import { LuCrosshair } from 'react-icons/lu';
import { Dialog } from '../ui/Dialog';
import Button from '../ui/Button';
import { formatDistance } from '../../lib/format';

/**
 * Shown instead of checking in straight away when the check-in would be
 * flagged: too far from the site, or no location yet. The agent can still
 * check in (sites move, GPS drifts), with a reason their manager will see.
 * Distance is live, so a GPS refresh that brings them in range shows at once.
 * Render with a `key` per attempt so the reason starts empty.
 */
const CheckInDialog = ({ open, onOpenChange, site, distance, flagged, radius, onRefreshGps, onConfirm }) => {
    const [reason, setReason] = useState('');
    const reasonId = useId();
    const hasPosition = distance != null;

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={hasPosition ? `You're ${formatDistance(distance)} from ${site.name}` : "Your location isn't known yet"}
            description={!hasPosition
                ? 'Without a location this check-in will be flagged for your manager. Try refreshing GPS first.'
                : flagged
                    ? `Check-ins more than ${formatDistance(radius)} from a site are flagged for your manager.`
                    : "You're close enough now. This check-in won't be flagged."}
            footer={(
                <>
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => onConfirm(reason)}>{flagged ? 'Check in anyway' : 'Check in'}</Button>
                </>
            )}
        >
            <div className="space-y-4">
                {!hasPosition && (
                    <Button variant="secondary" className="w-full" onClick={onRefreshGps}>
                        <LuCrosshair className="size-4" aria-hidden /> Refresh GPS
                    </Button>
                )}
                <div className="space-y-1.5">
                    <label htmlFor={reasonId} className="block text-sm font-semibold">Reason (optional)</label>
                    <textarea
                        id={reasonId}
                        rows={3}
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Site is on the other side of the fence; pin is at the road entrance"
                        className="block w-full resize-none rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-base text-fg placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
                    />
                </div>
            </div>
        </Dialog>
    );
};

export default CheckInDialog;
