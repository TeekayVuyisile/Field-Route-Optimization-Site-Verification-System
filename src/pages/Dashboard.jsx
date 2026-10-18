import { useState, useEffect } from 'react';
import { Container, Button, Row, Col, Card, Badge, Form, Alert } from 'react-bootstrap';
import { motion } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import { useTeam } from '../context/useTeam';
import { FaPlus, FaRoute, FaCalendarAlt, FaTrash, FaMapMarkedAlt, FaUserCheck } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import useTripStore from '../store/useTripStore';
import { fetchTripWithSites, updateTrip } from '../features/trips/tripRepository';
import { fetchTeamMembers, acceptPendingInvitation } from '../features/team/teamRepository';
import { TRIP_STATUS_LABELS, TRIP_STATUS_BADGE, statusAfterAssignment } from '../features/trips/tripStatus';
import dayjs from 'dayjs';
import { toast } from 'react-toastify';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const cardVariants = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
};

const Dashboard = () => {
    const { user } = useAuth();
    const { membership, isManager, pendingInvitation, error: teamError, refresh: refreshTeam } = useTeam();
    const navigate = useNavigate();
    const { currentTrip, loadTrip, clearStore } = useTripStore();
    const [trips, setTrips] = useState([]);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isJoining, setIsJoining] = useState(false);

    // RLS scopes this: managers get every team trip, agents their own + assigned
    useEffect(() => {
        if (!user || !membership) return;

        const fetchTrips = async () => {
            try {
                const [{ data, error }, teamMembers] = await Promise.all([
                    supabase.from('trips').select('*').order('created_at', { ascending: false }),
                    fetchTeamMembers()
                ]);

                if (error) throw error;
                setTrips(data || []);
                setMembers(teamMembers);
            } catch (error) {
                console.error('Error fetching trips:', error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchTrips();
    }, [user, membership]);

    const memberEmail = (userId) => members.find((m) => m.user_id === userId)?.email ?? 'a former teammate';

    const handleAssign = async (trip, assigneeId) => {
        try {
            const updated = await updateTrip(trip.id, {
                assigned_to: assigneeId,
                status: statusAfterAssignment(trip.status, assigneeId)
            });
            setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
            toast.success(assigneeId ? `Assigned to ${memberEmail(assigneeId)}` : 'Trip unassigned');
        } catch (error) {
            toast.error(`Couldn't assign trip: ${error.message}`);
        }
    };

    const handleAcceptInvitation = async () => {
        try {
            setIsJoining(true);
            await acceptPendingInvitation();
            clearStore();
            toast.success(`You joined ${pendingInvitation.orgName}`);
            refreshTeam();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setIsJoining(false);
        }
    };

    // Always load fresh from the database when resuming explicitly; a page
    // reload on /map/:id reuses the persisted store instead
    const handleResumeTrip = async (trip) => {
        try {
            const { trip: freshTrip, sites } = await fetchTripWithSites(trip.id);
            loadTrip(freshTrip, sites);
            navigate(`/map/${trip.id}`);
        } catch {
            toast.error("Failed to load trip sites");
        }
    };

    const handleDeleteTrip = async (e, tripId) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this trip?")) return;

        try {
            const { error } = await supabase
                .from('trips')
                .delete()
                .eq('id', tripId);

            if (error) throw error;
            setTrips(trips.filter(t => t.id !== tripId));
            if (currentTrip?.id === tripId) clearStore();
            toast.success("Trip deleted");
        } catch {
            toast.error("Failed to delete trip");
        }
    };

    const handleViewReview = (tripId) => {
        navigate(`/trip-review/${tripId}`);
    };

    const startNewTrip = () => {
        clearStore();
        navigate('/create-trip');
    };

    return (
        <Container className="page-shell">
            <Row className="mb-4 align-items-center">
                <Col>
                    <h1 className="fw-bold" style={{ color: 'var(--ink)' }}>Field Dashboard</h1>
                    <p className="text-muted mb-0">Manage and track your verification trips.</p>
                </Col>
                <Col xs="auto">
                    <Button variant="primary" className="px-4" onClick={startNewTrip}>
                        <FaPlus className="me-2" />
                        <span className="d-none d-md-inline">New Trip</span>
                        <span className="d-md-none">New</span>
                    </Button>
                </Col>
            </Row>

            {pendingInvitation && (
                <Alert variant="info" className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
                    <span>
                        You've been invited to join <strong>{pendingInvitation.orgName}</strong> as
                        {pendingInvitation.role === 'manager' ? ' a manager' : ' a field agent'}.
                    </span>
                    <Button variant="primary" size="sm" onClick={handleAcceptInvitation} disabled={isJoining}>
                        Join team
                    </Button>
                </Alert>
            )}

            {teamError && (
                <Alert variant="danger">
                    We couldn't load your team, so trips can't be shown. Try refreshing, or sign out and back in.
                </Alert>
            )}

            <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0 fw-bold" style={{ color: 'var(--ink)' }}>{isManager ? 'Team Trips' : 'Your Trips'}</h5>
                <Badge className="status-badge is-neutral">{trips.length} total</Badge>
            </div>

            {teamError ? null : loading ? (
                <Row className="g-4">
                    {[1, 2, 3].map((i) => (
                        <Col md={6} lg={4} key={i}>
                            <div className="skeleton" style={{ height: '230px' }} />
                        </Col>
                    ))}
                </Row>
            ) : trips.length > 0 ? (
                <motion.div variants={containerVariants} initial="hidden" animate="visible">
                    <Row className="g-4">
                        {trips.map(trip => (
                            <Col md={6} lg={4} key={trip.id}>
                                <motion.div variants={cardVariants} className="h-100">
                                    <Card className="h-100 hover-shadow" style={{ boxShadow: 'none' }}>
                                        <Card.Body className="p-4 d-flex flex-column">
                                            <div className="d-flex justify-content-between align-items-start mb-3">
                                                <span className="icon-chip is-lg">
                                                    <FaRoute />
                                                </span>
                                                <div className="d-flex align-items-center gap-2">
                                                    <span className={`status-badge ${TRIP_STATUS_BADGE[trip.status] ?? 'is-neutral'}`}>
                                                        {TRIP_STATUS_LABELS[trip.status] ?? trip.status}
                                                    </span>
                                                    {(isManager || trip.user_id === user.id) && (
                                                        <Button
                                                            variant="link"
                                                            className="text-danger p-0"
                                                            onClick={(e) => handleDeleteTrip(e, trip.id)}
                                                            title="Delete trip"
                                                            aria-label={`Delete ${trip.title}`}
                                                        >
                                                            <FaTrash size={14} />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                            <h5 className="fw-bold mb-1 text-truncate" style={{ color: 'var(--ink)' }}>{trip.title}</h5>
                                            <Card.Text className="text-muted small mb-2">
                                                <FaCalendarAlt className="me-1" />
                                                {dayjs(trip.created_at).format('DD MMM YYYY')}
                                            </Card.Text>

                                            {isManager ? (
                                                <Form.Select
                                                    size="sm"
                                                    className="mb-3"
                                                    value={trip.assigned_to ?? ''}
                                                    aria-label={`Assign ${trip.title}`}
                                                    onChange={(e) => handleAssign(trip, e.target.value || null)}
                                                >
                                                    <option value="">Unassigned</option>
                                                    {members.map((m) => (
                                                        <option key={m.user_id} value={m.user_id}>
                                                            {m.user_id === user.id ? `${m.email} (you)` : m.email}
                                                        </option>
                                                    ))}
                                                </Form.Select>
                                            ) : (
                                                <Card.Text className="small mb-3" style={{ color: 'var(--text-muted)' }}>
                                                    <FaUserCheck className="me-1" />
                                                    {trip.assigned_to === user.id
                                                        ? 'Assigned to you'
                                                        : trip.assigned_to ? `Assigned to ${memberEmail(trip.assigned_to)}` : 'Not assigned'}
                                                </Card.Text>
                                            )}

                                            <div className="mt-auto d-grid gap-2">
                                                <Button
                                                    variant="outline-primary"
                                                    size="sm"
                                                    onClick={() => handleViewReview(trip.id)}
                                                >
                                                    View Trip Info
                                                </Button>
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => handleResumeTrip(trip)}
                                                >
                                                    <FaMapMarkedAlt className="me-2" />
                                                    Resume Map
                                                </Button>
                                            </div>
                                        </Card.Body>
                                    </Card>
                                </motion.div>
                            </Col>
                        ))}
                    </Row>
                </motion.div>
            ) : (
                <div className="empty-state">
                    <span className="icon-chip is-lg">
                        <FaRoute />
                    </span>
                    <h4 className="fw-bold mt-3" style={{ color: 'var(--ink)' }}>No trips yet</h4>
                    <p className="mx-auto mb-3" style={{ maxWidth: '320px' }}>
                        Create your first trip to start optimizing field routes and collecting site evidence.
                    </p>
                    <Button variant="primary" className="px-4" onClick={startNewTrip}>
                        Create Your First Trip
                    </Button>
                </div>
            )}
        </Container>
    );
};

export default Dashboard;
