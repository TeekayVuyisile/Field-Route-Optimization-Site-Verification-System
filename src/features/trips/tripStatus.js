// Trip lifecycle: draft -> assigned -> in_progress -> completed.
// The database stamps started_at / completed_at when status changes
// (guard_trip_write trigger); these helpers only decide the status.

export const TRIP_STATUS_LABELS = {
    draft: 'Draft',
    assigned: 'Assigned',
    in_progress: 'In progress',
    completed: 'Completed',
};

// Badge tones (components/ui primitives)
export const TRIP_STATUS_TONE = {
    draft: 'neutral',
    assigned: 'accent',
    in_progress: 'warning',
    completed: 'success',
};

/** Status after (un)assigning. Work already started or finished is kept. */
export const statusAfterAssignment = (currentStatus, assigneeId) => {
    if (currentStatus === 'in_progress' || currentStatus === 'completed') return currentStatus;
    return assigneeId ? 'assigned' : 'draft';
};

/**
 * Status implied by site progress: all checked -> completed, some checked ->
 * in_progress. Unchecking everything doesn't "un-start" a trip, but
 * unchecking a site on a completed trip reopens it.
 */
export const statusFromProgress = (currentStatus, sites) => {
    const checked = sites.filter((s) => s.is_checked).length;
    if (sites.length > 0 && checked === sites.length) return 'completed';
    if (checked > 0) return 'in_progress';
    return currentStatus === 'completed' ? 'in_progress' : currentStatus;
};
