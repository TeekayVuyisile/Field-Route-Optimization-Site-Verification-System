import { useState, useEffect } from 'react';
import { Container, Button, Row, Col, Card, Badge } from 'react-bootstrap';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { FaPlus, FaRoute, FaCalendarAlt, FaTrash, FaMapMarkedAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import useTripStore from '../store/useTripStore';
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
    const navigate = useNavigate();
    const { setCurrentTrip, setSites, clearStore } = useTripStore();
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTrips();
    }, [user]);

    const fetchTrips = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('trips')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTrips(data || []);
        } catch (error) {
            console.error('Error fetching trips:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResumeTrip = async (trip) => {
        try {
            const { data: sitesData, error } = await supabase
                .from('sites')
                .select('*')
                .eq('trip_id', trip.id)
                .order('order_index', { ascending: true });

            if (error) throw error;

            const mappedSites = sitesData.map(s => ({
                ...s,
                isValid: true
            }));

            setCurrentTrip(trip);
            setSites(mappedSites);
            navigate('/map');
        } catch (error) {
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
            toast.success("Trip deleted");
        } catch (error) {
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

            <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0 fw-bold" style={{ color: 'var(--ink)' }}>Recent Trips</h5>
                <Badge className="status-badge is-neutral">{trips.length} total</Badge>
            </div>

            {loading ? (
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
                                                <Button
                                                    variant="link"
                                                    className="text-danger p-0"
                                                    onClick={(e) => handleDeleteTrip(e, trip.id)}
                                                    title="Delete trip"
                                                >
                                                    <FaTrash size={14} />
                                                </Button>
                                            </div>
                                            <h5 className="fw-bold mb-1 text-truncate" style={{ color: 'var(--ink)' }}>{trip.title}</h5>
                                            <Card.Text className="text-muted small mb-4">
                                                <FaCalendarAlt className="me-1" />
                                                {dayjs(trip.created_at).format('DD MMM YYYY')}
                                            </Card.Text>

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
