import { useEffect, useState, useMemo, useCallback } from 'react';
import { Container, Row, Col, Card, Button, ListGroup, Spinner, Badge, Form } from 'react-bootstrap';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useTripStore from '../store/useTripStore';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaRegCircle, FaRoute, FaSync, FaSave, FaVolumeUp, FaVolumeMute, FaLocationArrow } from 'react-icons/fa';
import { getOptimizedRoute, getDirections } from '../services/orsService';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { speak, calculateDistance } from '../utils/navigationUtils';
import debounce from 'lodash/debounce';
import './MapView.css';

// Custom Icons
const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const blueIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const yellowIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const RecenterAutomatically = ({ lat, lng }) => {
    const map = useMap();
    useEffect(() => {
        if (lat && lng) map.setView([lat, lng]);
    }, [lat, lng]);
    return null;
};

const MapView = () => {
    const { currentTrip, sites, setSites, updateSite } = useTripStore();
    const navigate = useNavigate();
    const [userPos, setUserPos] = useState(null);
    const [routeData, setRouteData] = useState(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [nextSite, setNextSite] = useState(null);
    const [savingStatus, setSavingStatus] = useState('');
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [lastAnnouncedId, setLastAnnouncedId] = useState(null);
    const [showSidebar, setShowSidebar] = useState(true);

    // Watch user position & Proximity Alert
    useEffect(() => {
        if (!navigator.geolocation) return;
        const id = navigator.geolocation.watchPosition(
            (pos) => {
                const currentLat = pos.coords.latitude;
                const currentLng = pos.coords.longitude;
                setUserPos({ lat: currentLat, lng: currentLng });

                // Check proximity to next site
                if (nextSite && voiceEnabled && nextSite.id !== lastAnnouncedId) {
                    const dist = calculateDistance(currentLat, currentLng, nextSite.latitude, nextSite.longitude);
                    if (dist < 100) { // 100 meters
                        speak(`Approaching destination: ${nextSite.name}. You are within 100 meters.`);
                        setLastAnnouncedId(nextSite.id);
                    }
                }
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
        return () => navigator.geolocation.clearWatch(id);
    }, [nextSite, voiceEnabled, lastAnnouncedId]);

    const optimizeRoute = async () => {
        if (!userPos || sites.length === 0) {
            toast.warn("Waiting for GPS location...");
            return;
        }

        try {
            setIsOptimizing(true);
            const uncheckedSites = sites.filter(s => !s.is_checked);
            
            if (uncheckedSites.length === 0) {
                toast.info("All sites checked!");
                if (voiceEnabled) speak("All sites have been checked. Trip complete.");
                return;
            }

            const optimizedSites = await getOptimizedRoute(userPos, uncheckedSites);
            const checkedSites = sites.filter(s => s.is_checked);
            setSites([...optimizedSites, ...checkedSites]);
            
            const target = optimizedSites[0];
            setNextSite(target);
            if (voiceEnabled) {
                speak(`Route optimized. Your next destination is ${target.name}.`);
            }

            // 3. Get route geometry
            let routeCoords = [];
            if (optimizedSites.length > 0 && optimizedSites.length < 50) {
                // Full route for small datasets
                routeCoords = [
                    [userPos.lng, userPos.lat],
                    ...optimizedSites.map(s => [s.longitude, s.latitude])
                ];
                toast.info("Full optimized route calculated.");
            } else if (optimizedSites.length >= 50) {
                // Only route to the NEXT destination for large datasets
                routeCoords = [
                    [userPos.lng, userPos.lat],
                    [optimizedSites[0].longitude, optimizedSites[0].latitude]
                ];
                toast.info("Large dataset: Showing route to next destination only.");
            }

            if (routeCoords.length > 0) {
                const directions = await getDirections(routeCoords);
                setRouteData(directions);
            } else {
                setRouteData(null);
            }
            
            toast.success("Route optimized!");
        } catch (error) {
            toast.error("Failed to optimize route.");
        } finally {
            setIsOptimizing(false);
        }
    };

    // Autosave functionality
    const debouncedSave = useCallback(
        debounce(async (siteId, updates) => {
            if (!siteId || siteId.length > 36) return; // Skip temporary UUIDs
            
            try {
                setSavingStatus('Saving...');
                const { error } = await supabase
                    .from('sites')
                    .update(updates)
                    .eq('id', siteId);
                
                if (error) throw error;
                setSavingStatus('All changes saved');
                setTimeout(() => setSavingStatus(''), 2000);
            } catch (err) {
                console.error('Autosave error:', err.message);
                setSavingStatus('Save failed');
            }
        }, 2000),
        []
    );

    const handleUpdateSite = (id, updates) => {
        const index = sites.findIndex(s => s.id === id);
        updateSite(index, updates);
        
        // If the site exists in Supabase (has a valid UUID from DB), autosave it
        if (typeof id === 'string' && id.length === 36 && !id.startsWith('temp-')) {
            debouncedSave(id, updates);
        }
    };

    if (!currentTrip || sites.length === 0) {
        return (
            <Container className="text-center mt-5">
                <h3>No active trip to map</h3>
                <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
            </Container>
        );
    }

    const center = userPos ? [userPos.lat, userPos.lng] : [sites[0].latitude, sites[0].longitude];

    return (
        <Container fluid className="px-2 px-md-4">
            <Row className="mb-3 align-items-center">
                <Col>
                    <h3 className="mb-0 text-truncate" style={{ maxWidth: '250px' }}>{currentTrip.title}</h3>
                    {savingStatus && <small className="text-muted"><FaSync className="fa-spin me-1" />{savingStatus}</small>}
                </Col>
                <Col xs="auto" className="d-flex align-items-center">
                    <Button 
                        variant={voiceEnabled ? "success" : "outline-secondary"} 
                        className="me-2 rounded-circle shadow-sm"
                        onClick={() => setVoiceEnabled(!voiceEnabled)}
                        title={voiceEnabled ? "Disable Voice Guidance" : "Enable Voice Guidance"}
                    >
                        {voiceEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
                    </Button>
                    <Button 
                        variant="primary" 
                        className="me-2 rounded-pill shadow-sm d-none d-md-block" 
                        onClick={optimizeRoute} 
                        disabled={isOptimizing || !userPos}
                    >
                        {isOptimizing ? <Spinner size="sm" /> : <FaRoute className="me-2" />}
                        Optimize
                    </Button>
                    <Button variant="light" className="rounded-circle shadow-sm d-md-none" onClick={() => setShowSidebar(!showSidebar)}>
                        <FaLocationArrow />
                    </Button>
                </Col>
            </Row>

            <Row className="g-0">
                <Col md={8} lg={9}>
                    <div className="map-container position-relative">
                        <MapContainer center={center} zoom={13} zoomControl={false}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            
                            {userPos && (
                                <Marker position={[userPos.lat, userPos.lng]} icon={blueIcon}>
                                    <Popup>Your Location</Popup>
                                </Marker>
                            )}

                            {routeData && <GeoJSON data={routeData} style={{ color: '#3388ff', weight: 5, opacity: 0.7 }} />}

                            {sites.map((site) => (
                                <Marker 
                                    key={site.id} 
                                    position={[site.latitude, site.longitude]}
                                    icon={site.is_checked ? greenIcon : (site.id === nextSite?.id ? yellowIcon : redIcon)}
                                >
                                    <Popup minWidth={200}>
                                        <div className="p-1">
                                            <h6>{site.name}</h6>
                                            <Form.Group className="mb-2">
                                                <Form.Label className="small mb-1">Field Notes</Form.Label>
                                                <Form.Control 
                                                    as="textarea" 
                                                    rows={2} 
                                                    size="sm"
                                                    placeholder="Add notes..."
                                                    value={site.notes || ''}
                                                    onChange={(e) => handleUpdateSite(site.id, { notes: e.target.value })}
                                                />
                                            </Form.Group>
                                            <Button 
                                                size="sm" 
                                                variant={site.is_checked ? "warning" : "success"}
                                                className="w-100"
                                                onClick={() => handleUpdateSite(site.id, { is_checked: !site.is_checked })}
                                            >
                                                {site.is_checked ? 'Mark Unchecked' : 'Mark Checked'}
                                            </Button>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}

                            {userPos && <RecenterAutomatically lat={userPos.lat} lng={userPos.lng} />}
                        </MapContainer>
                        
                        {/* Mobile Floating Action Button */}
                        <div className="d-md-none position-absolute" style={{ bottom: '20px', right: '20px', zIndex: 1000 }}>
                            <Button 
                                variant="primary" 
                                className="rounded-circle shadow-lg p-3" 
                                onClick={optimizeRoute}
                                disabled={isOptimizing || !userPos}
                            >
                                {isOptimizing ? <Spinner size="sm" /> : <FaRoute size={24} />}
                            </Button>
                        </div>
                    </div>
                </Col>

                {showSidebar && (
                    <Col md={4} lg={3}>
                        <Card className="site-sidebar shadow-sm border-0 ms-md-3">
                            <Card.Header className="bg-white border-bottom-0 py-3 d-flex justify-content-between align-items-center">
                                <h5 className="mb-0 fw-bold">Route Order</h5>
                                <Badge bg="primary" pill>
                                    {sites.filter(s => s.is_checked).length} / {sites.length}
                                </Badge>
                            </Card.Header>
                            <ListGroup variant="flush" className="overflow-auto" style={{ height: 'calc(100% - 60px)' }}>
                                {sites.map((site, index) => (
                                    <ListGroup.Item 
                                        key={site.id}
                                        className={`${site.id === nextSite?.id ? 'bg-light border-start border-4 border-warning' : ''}`}
                                    >
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <div className="text-truncate">
                                                <Badge bg="secondary" className="me-2">{(index + 1).toString()}</Badge>
                                                {site.is_checked ? <FaCheckCircle className="text-success me-1" /> : <FaRegCircle className="text-danger me-1" />}
                                                <span className={site.is_checked ? 'text-decoration-line-through text-muted' : 'fw-bold'}>
                                                    {site.name}
                                                </span>
                                            </div>
                                            <Button 
                                                size="sm" 
                                                variant="link" 
                                                className="p-0 text-decoration-none"
                                                onClick={() => handleUpdateSite(site.id, { is_checked: !site.is_checked })}
                                            >
                                                {site.is_checked ? 'Undo' : 'Done'}
                                            </Button>
                                        </div>
                                        {site.notes && <div className="text-muted small text-truncate mt-1 fst-italic">"{site.notes}"</div>}
                                    </ListGroup.Item>
                                ))}
                            </ListGroup>
                        </Card>
                    </Col>
                )}
            </Row>
        </Container>
    );
};

export default MapView;
