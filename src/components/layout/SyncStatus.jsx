import { useState } from 'react';
import { LuCloudOff, LuCloudUpload, LuTriangleAlert } from 'react-icons/lu';
import { outbox } from '../../features/offline';
import { useOnline, useOutboxStatus } from '../../features/offline/useOutbox';
import useTripStore from '../../store/useTripStore';
import { countLabel } from '../../lib/format';
import { Dialog } from '../ui/Dialog';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import { cn } from '../ui/cn';

const describe = (entry, siteName) => {
    if (entry.kind === 'photo') return `Photo for ${siteName(entry.payload.siteId)}`;
    if (entry.kind === 'site') return `Changes to ${siteName(entry.id)}`;
    return 'Trip progress';
};

/**
 * Top-bar pill for work that hasn't reached the server yet. Hidden when all
 * is saved; opens a panel explaining what's waiting and, for changes the
 * server refused, offers retry or discard.
 */
const SyncStatus = () => {
    const online = useOnline();
    const { pending, photos, failed, syncing } = useOutboxStatus();
    const sites = useTripStore((s) => s.sites);
    const [open, setOpen] = useState(false);

    if (online && pending === 0 && failed.length === 0) return null;

    const siteName = (id) => sites.find((s) => s.id === id)?.name ?? 'a site';
    const tone = failed.length > 0 ? 'danger' : online ? 'accent' : 'warning';
    const label = failed.length > 0 ? `${failed.length} not saved`
        : !online ? (pending > 0 ? `Offline · ${pending}` : 'Offline')
        : syncing ? 'Saving' : `${pending} waiting`;
    const Icon = failed.length > 0 ? LuTriangleAlert : online ? LuCloudUpload : LuCloudOff;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-200',
                    tone === 'danger' && 'bg-danger-soft text-danger',
                    tone === 'warning' && 'bg-warning-soft text-warning',
                    tone === 'accent' && 'bg-accent-soft text-accent'
                )}
                aria-label={`Sync status: ${label}`}
            >
                {syncing && online ? <Spinner className="size-4" label="Saving" /> : <Icon className="size-4" aria-hidden />}
                {label}
            </button>

            <Dialog
                open={open}
                onOpenChange={setOpen}
                title={online ? 'Saving your changes' : "You're offline"}
                description={online
                    ? 'Changes made on this phone are being sent to your team.'
                    : 'Keep working: check-ins, notes and photos are saved on this phone and sent when you have signal.'}
            >
                <div className="space-y-4 text-sm">
                    {pending > 0 && (
                        <p className="rounded-xl bg-surface-2 p-3">
                            <span className="font-semibold">{countLabel(pending, 'change')} waiting</span>
                            {photos > 0 && <> including {countLabel(photos, 'photo')}</>}. Don't sign out until they're sent.
                        </p>
                    )}
                    {failed.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-muted">The server refused these. Retry, or discard them if they're no longer needed.</p>
                            <ul className="divide-y divide-border rounded-xl border border-border">
                                {failed.map((entry) => (
                                    <li key={entry.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold">{describe(entry, siteName)}</p>
                                            <p className="truncate text-faint" title={entry.failed.message}>{entry.failed.message}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="danger-ghost" onClick={() => outbox.discard(entry.key)}>Discard</Button>
                                            <Button variant="secondary" onClick={() => outbox.retry(entry.key)}>Retry</Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </Dialog>
        </>
    );
};

export default SyncStatus;
