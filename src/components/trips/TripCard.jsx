import dayjs from 'dayjs';
import { LuMap, LuFileText, LuTrash2, LuUserRound } from 'react-icons/lu';
import Button from '../ui/Button';
import { Card, Badge, ProgressBar } from '../ui/primitives';
import { Select } from '../ui/Field';
import { TRIP_STATUS_LABELS, TRIP_STATUS_TONE } from '../../features/trips/tripStatus';

/**
 * One trip on the dashboard: status, progress, assignee, and actions.
 * Managers get an assignee picker; everyone else sees who it's assigned to.
 */
const TripCard = ({
    trip, currentUserId, isManager, members, memberEmail,
    onOpenMap, onOpenReport, onAssign, onDelete, opening = false
}) => {
    const done = trip.siteCount > 0 && trip.checkedCount === trip.siteCount;
    const canDelete = isManager || trip.user_id === currentUserId;

    const assigneeLabel = trip.assigned_to === currentUserId
        ? 'Assigned to you'
        : trip.assigned_to ? memberEmail(trip.assigned_to) : 'Not assigned';

    return (
        <Card as="article" className="flex flex-col p-5 transition-shadow duration-200 hover:shadow-raised">
            <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 truncate text-lg font-bold tracking-tight" title={trip.title}>{trip.title}</h3>
                <Badge tone={TRIP_STATUS_TONE[trip.status] ?? 'neutral'} className="shrink-0">
                    {TRIP_STATUS_LABELS[trip.status] ?? trip.status}
                </Badge>
            </div>
            <p className="mt-1 text-sm text-faint">
                {dayjs(trip.created_at).format('D MMM YYYY')} · {trip.siteCount} {trip.siteCount === 1 ? 'site' : 'sites'}
            </p>

            <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                    <span className="text-muted">Progress</span>
                    <span className="font-semibold tabular-nums">{trip.checkedCount}/{trip.siteCount} checked</span>
                </div>
                <ProgressBar
                    value={trip.checkedCount}
                    max={trip.siteCount}
                    tone={done ? 'success' : 'accent'}
                    label={`${trip.title}: ${trip.checkedCount} of ${trip.siteCount} sites checked`}
                />
            </div>

            <div className="mt-4">
                {isManager ? (
                    <Select
                        value={trip.assigned_to ?? ''}
                        aria-label={`Assign ${trip.title}`}
                        onChange={(e) => onAssign(trip, e.target.value || null)}
                    >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                                {m.user_id === currentUserId ? `${m.email} (you)` : m.email}
                            </option>
                        ))}
                    </Select>
                ) : (
                    <p className="flex items-center gap-2 text-sm text-muted">
                        <LuUserRound className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{assigneeLabel}</span>
                    </p>
                )}
            </div>

            <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                <Button className="flex-1" onClick={() => onOpenMap(trip)} loading={opening}>
                    {!opening && <LuMap className="size-4" aria-hidden />} Open map
                </Button>
                <Button variant="secondary" onClick={() => onOpenReport(trip)}>
                    <LuFileText className="size-4" aria-hidden /> Report
                </Button>
                {canDelete && (
                    <Button
                        variant="danger-ghost"
                        size="icon"
                        onClick={() => onDelete(trip)}
                        aria-label={`Delete ${trip.title}`}
                        title="Delete trip"
                    >
                        <LuTrash2 className="size-5" />
                    </Button>
                )}
            </div>
        </Card>
    );
};

export default TripCard;
