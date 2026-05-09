import { useState, useEffect } from 'react';
import { Container, Button, Row, Col, Card, Spinner, ListGroup } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { FaPlus, FaRoute, FaCalendarAlt, FaChevronRight, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import useTripStore from '../store/useTripStore';
import dayjs from 'dayjs';
import { toast } from 'react-toastify';

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
            // Fetch sites for this trip
            const { data: sitesData, error } = await supabase
                .from('sites')
                .select('*')
                .eq('trip_id', trip.id)
                .order('order_index', { ascending: true });

            if (error) throw error;

            // Map database fields to store fields if necessary
            const mappedSites = sitesData.map(s => ({
                ...s,
                isValid: true // Database sites are assumed valid
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

    const startNewTrip = () => {
        clearStore();
        navigate('/create-trip');
    };

    return (
        <Container className="py-4">
            <Row className="mb-4 align-items-center">
                <Col>
                    <h1 className="fw-bold text-dark">Field Dashboard</h1>
                    <p className="text-muted">Manage and track your verification trips.</p>
                </Col>
                <Col xs="auto">
                    <Button variant="primary" className="rounded-pill px-4 shadow-sm" onClick={startNewTrip}>
                        <FaPlus className="me-2" />
                        <span className="d-none d-md-inline">New Trip</span>
                        <span className="d-md-none">New</span>
                    </Button>
                </Col>
            </Row>

            <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="mb-0 fw-bold">Recent Trips</h4>
                <Badge bg="light" text="dark" className="border">{trips.length} Total</Badge>
            </div>
            
            {loading ? (
                <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                </div>
            ) : trips.length > 0 ? (
                <Row className="g-4">
                    {trips.map(trip => (
                        <Col md={6} lg={4} key={trip.id}>
                            <Card 
                                className="h-100 cursor-pointer shadow-sm hover-shadow border-0" 
                                onClick={() => handleResumeTrip(trip)}
                                style={{ borderRadius: '15px' }}
                            >
                                <Card.Body className="p-4">
                                    <div className="d-flex justify-content-between align-items-start mb-3">
                                        <div className="bg-primary bg-opacity-10 p-3 rounded-circle me-3">
                                            <FaRoute className="text-primary" size={20} />
                                        </div>
                                        <Button 
                                            variant="link" 
                                            className="text-danger p-0 opacity-50 hover-opacity-100"
                                            onClick={(e) => handleDeleteTrip(e, trip.id)}
                                        >
                                            <FaTrash size={14} />
                                        </Button>
                                    </div>
                                    <h5 className="fw-bold mb-1 text-truncate">{trip.title}</h5>
                                    <Card.Text className="text-muted small mb-3">
                                        <FaCalendarAlt className="me-1 opacity-50" />
                                        {dayjs(trip.created_at).format('DD MMM YYYY')}
                                    </Card.Text>
                                    <div className="d-flex justify-content-between align-items-center mt-auto">
                                        <Badge bg="success" bg-opacity-10 className="text-success border-success border-opacity-25 px-3 py-2">
                                            Active
                                        </Badge>
                                        <FaChevronRight className="text-primary opacity-50" />
                                    </div>
                                </Card.Body>
                            </Card>
                        </Col>
                    ))}
                </Row>
            ) : (
                <Card className="text-center p-5 border-dashed bg-light">
                    <Card.Body>
                        <div className="mb-3">
                            <FaRoute size={48} className="text-muted opacity-25" />
                        </div>
                        <h4 className="fw-bold">No trips found</h4>
                        <p className="text-muted mx-auto" style={{ maxWidth: '300px' }}>
                            Ready to start? Create your first trip to begin optimizing field routes.
                        </p>
                        <Button variant="primary" className="rounded-pill px-4 mt-2" onClick={startNewTrip}>
                            Get Started
                        </Button>
                    </Card.Body>
                </Card>
            )}
        </Container>
    );
};

export default Dashboard;
