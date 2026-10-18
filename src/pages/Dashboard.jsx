import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuPlus, LuRoute, LuUsers } from 'react-icons/lu';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';
import { useTeam } from '../context/useTeam';
import useTripStore from '../store/useTripStore';
import { fetchTripsWithProgress, fetchTripWithSites, updateTrip, deleteTrip } from '../features/trips/tripRepository';
import { fetchTeamMembers, acceptPendingInvitation } from '../features/team/teamRepository';
import { statusAfterAssignment } from '../features/trips/tripStatus';
import TripCard from '../components/trips/TripCard';
import Button from '../components/ui/Button';
import { Alert, EmptyState, PageHeader, Skeleton } from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/Dialog';
import { cn } from '../components/ui/cn';

const FILTERS = [
    { id: 'active', label: 'Active', match: (t) => t.status !== 'completed' },
    { id: 'completed', label: 'Completed', match: (t) => t.status === 'completed' },
    { id: 'all', label: 'All', match: () => true },
];

const Dashboard = () => {
    const { user } = useAuth();
    const { membership, isManager, pendingInvitation, loading: teamLoading, error: teamError, refresh: refreshTeam } = useTeam();
    const navigate = useNavigate();
    const { currentTrip, loadTrip, clearStore } = useTripStore();

    const [trips, setTrips] = useState([]);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [filter, setFilter] = useState('active');
    const [openingId, setOpeningId] = useState(null);
    const [tripToDelete, setTripToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [joining, setJoining] = useState(false);

    // RLS scopes this: managers get every team trip, agents their own + assigned
    useEffect(() => {
        if (!user || !membership) return;
        let cancelled = false;

        (async () => {
            try {
                const [tripRows, teamMembers] = await Promise.all([fetchTripsWithProgress(), fetchTeamMembers()]);
                if (cancelled) return;
                setTrips(tripRows);
                setMembers(teamMembers);
                setLoadError(null);
            } catch (error) {
                console.error('Error fetching trips:', error);
                if (!cancelled) setLoadError(error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [user, membership]);

    const counts = useMemo(
        () => Object.fromEntries(FILTERS.map((f) => [f.id, trips.filter(f.match).length])),
        [trips]
    );
    const visibleTrips = trips.filter(FILTERS.find((f) => f.id === filter).match);

    const memberEmail = (userId) => members.find((m) => m.user_id === userId)?.email ?? 'a former teammate';

    const startNewTrip = () => {
        clearStore();
        navigate('/create-trip');
    };

    // Always load fresh from the database when opening explicitly; a page
    // reload on /map/:id reuses the persisted store instead
    const handleOpenMap = async (trip) => {
        try {
            setOpeningId(trip.id);
            const { trip: freshTrip, sites } = await fetchTripWithSites(trip.id);
            loadTrip(freshTrip, sites);
            navigate(`/map/${trip.id}`);
        } catch {
            toast.error("Couldn't load this trip's sites.");
            setOpeningId(null);
        }
    };

    const handleAssign = async (trip, assigneeId) => {
        try {
            const updated = await updateTrip(trip.id, {
                assigned_to: assigneeId,
                status: statusAfterAssignment(trip.status, assigneeId)
            });
            // Keep the progress counts, which the update response doesn't include
            setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, ...updated } : t)));
            toast.success(assigneeId ? `Assigned to ${memberEmail(assigneeId)}` : 'Trip unassigned');
        } catch (error) {
            toast.error(`Couldn't assign trip: ${error.message}`);
        }
    };

    const handleConfirmDelete = async () => {
        try {
            setDeleting(true);
            await deleteTrip(tripToDelete.id);
            setTrips((prev) => prev.filter((t) => t.id !== tripToDelete.id));
            if (currentTrip?.id === tripToDelete.id) clearStore();
            toast.success('Trip deleted');
            setTripToDelete(null);
        } catch (error) {
            toast.error(error.message || "Couldn't delete the trip.");
        } finally {
            setDeleting(false);
        }
    };

    const handleAcceptInvitation = async () => {
        try {
            setJoining(true);
            await acceptPendingInvitation();
            clearStore();
            toast.success(`You joined ${pendingInvitation.orgName}`);
            refreshTeam();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setJoining(false);
        }
    };

    const showSkeleton = teamLoading || (membership && loading);

    return (
        <div className="ui mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
            <PageHeader
                title={isManager ? 'Team trips' : 'Your trips'}
                description={isManager
                    ? 'Plan routes, assign them to your team and follow progress.'
                    : 'Trips you created or that were assigned to you.'}
                actions={(
                    <Button onClick={startNewTrip} className="hidden sm:inline-flex">
                        <LuPlus className="size-4" aria-hidden /> New trip
                    </Button>
                )}
            />

            <div className="space-y-4">
                {pendingInvitation && (
                    <Alert
                        tone="info"
                        title={`You've been invited to join ${pendingInvitation.orgName}`}
                        action={<Button onClick={handleAcceptInvitation} loading={joining}>Join team</Button>}
                    >
                        You'd join as {pendingInvitation.role === 'manager' ? 'a manager' : 'a field agent'}.
                    </Alert>
                )}
                {(teamError || loadError) && (
                    <Alert tone="danger" title="Trips couldn't be loaded">
                        Check your connection and refresh. If it keeps happening, sign out and back in.
                    </Alert>
                )}
            </div>

            {showSkeleton ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading trips">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
                </div>
            ) : !teamError && !loadError && trips.length === 0 ? (
                <EmptyState
                    className="mt-6"
                    icon={LuRoute}
                    title={isManager ? 'No trips yet' : 'Nothing assigned to you yet'}
                    action={<Button onClick={startNewTrip}><LuPlus className="size-4" aria-hidden /> Create a trip</Button>}
                >
                    {isManager
                        ? 'Import a spreadsheet of sites or add them by hand, then assign the trip to a teammate.'
                        : 'Trips your manager assigns appear here. You can also create your own.'}
                </EmptyState>
            ) : trips.length > 0 && (
                <>
                    <div className="mt-6 flex items-center justify-between gap-3">
                        <div role="group" aria-label="Filter trips" className="inline-flex rounded-xl bg-surface-2 p-1">
                            {FILTERS.map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    aria-pressed={filter === f.id}
                                    onClick={() => setFilter(f.id)}
                                    className={cn(
                                        'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors duration-200',
                                        filter === f.id ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
                                    )}
                                >
                                    {f.label}{' '}
                                    <span className="tabular-nums text-faint">{counts[f.id]}</span>
                                </button>
                            ))}
                        </div>
                        {isManager && (
                            <Button variant="ghost" to="/team" className="hidden md:inline-flex">
                                <LuUsers className="size-4" aria-hidden /> {members.length} {members.length === 1 ? 'member' : 'members'}
                            </Button>
                        )}
                    </div>

                    {visibleTrips.length > 0 ? (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {visibleTrips.map((trip) => (
                                <TripCard
                                    key={trip.id}
                                    trip={trip}
                                    currentUserId={user.id}
                                    isManager={isManager}
                                    members={members}
                                    memberEmail={memberEmail}
                                    opening={openingId === trip.id}
                                    onOpenMap={handleOpenMap}
                                    onOpenReport={(t) => navigate(`/trip-review/${t.id}`)}
                                    onAssign={handleAssign}
                                    onDelete={setTripToDelete}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="mt-10 text-center text-muted">
                            {filter === 'completed' ? 'No completed trips yet.' : 'No active trips. Nice work.'}
                        </p>
                    )}
                </>
            )}

            <ConfirmDialog
                open={Boolean(tripToDelete)}
                onOpenChange={(open) => { if (!open) setTripToDelete(null); }}
                title="Delete this trip?"
                description={tripToDelete
                    ? `"${tripToDelete.title}" and its ${tripToDelete.siteCount} sites, notes and photo records will be removed for everyone on the team. This can't be undone.`
                    : ''}
                confirmLabel="Delete trip"
                loading={deleting}
                onConfirm={handleConfirmDelete}
            />
        </div>
    );
};

export default Dashboard;
