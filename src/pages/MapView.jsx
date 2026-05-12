import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Container, Row, Col, Card, Button, ListGroup, Spinner, Badge, Form } from 'react-bootstrap';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useTripStore from '../store/useTripStore';
import { useNavigate } from 'react-router-dom';
import { 
    FaCheckCircle, FaRegCircle, FaRoute, FaSync, FaSave, 
    FaVolumeUp, FaVolumeMute, FaLocationArrow, FaPlus, 
    FaEdit, FaTrash, FaCrosshairs, FaCamera, FaImage 
} from 'react-icons/fa';
import { getOptimizedRoute, getDirections } from '../services/orsService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { speak, calculateDistance, isOffRoute } from '../utils/navigationUtils';
import ManualSiteModal from '../components/ManualSiteModal';
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
    const { currentTrip, sites, setSites, updateSite, removeSite } = useTripStore();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [userPos, setUserPos] = useState(null);
    const [routeData, setRouteData] = useState(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [nextSite, setNextSite] = useState(null);
    const [savingStatus, setSavingStatus] = useState('');
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [lastAnnouncedId, setLastAnnouncedId] = useState(null);
    const [showSidebar, setShowSidebar] = useState(true);
    
    // Site Modal States
    const [showModal, setShowModal] = useState(false);
    const [editSiteData, setEditSiteData] = useState(null);

    // Navigation State
    const [navigationSteps, setNavigationSteps] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const lastRerouteTime = useMemo(() => ({ current: 0 }), []);
    
    // Phase 2: Track heads-up announcements
    const lastHeadsUpIdx = useRef(-1);
    
    // Stable refs for GPS and optimization to prevent effect restarts
    const routeDataRef = useRef(null);
    const navStateRef = useRef({ steps: [], index: 0, nextSite: null, lastAnnounced: null });
    
    useEffect(() => {
        routeDataRef.current = routeData;
        // Reset heads-up when a new route is calculated
        lastHeadsUpIdx.current = -1;
    }, [routeData]);

    useEffect(() => {
        navStateRef.current = { 
            steps: navigationSteps, 
            index: currentStepIndex, 
            nextSite: nextSite, 
            lastAnnounced: lastAnnouncedId 
        };
    }, [navigationSteps, currentStepIndex, nextSite, lastAnnouncedId]);

    const [uploadingSites, setUploadingSites] = useState(new Set());

    const refreshGPS = useCallback(() => {
        if (!navigator.geolocation) {
            toast.error("Geolocation is not supported by this browser.");
            return;
        }

        toast.info("Acquiring high-accuracy GPS signal...");
        
        // Use a longer timeout for the first attempt
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserPos(p);
                toast.success("GPS Lock Acquired!");
            },
            (err) => {
                console.error("GPS Error:", err);
                if (err.code === 3) { // Timeout
                    toast.warning("High-accuracy timed out. Trying standard GPS...");
                    // Fallback to lower accuracy (faster)
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                            setUserPos(p);
                            toast.success("GPS Location found (standard accuracy)");
                        },
                        (err2) => toast.error(`GPS Error: ${err2.message}`),
                        { enableHighAccuracy: false, timeout: 10000 }
                    );
                } else {
                    toast.error(`GPS Error: ${err.message}`);
                }
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    }, []);

    const optimizeRoute = useCallback(async (isAutoReroute = false, forcedPos = null) => {
        const currentPos = forcedPos || userPos;
        
        if (!currentPos || sites.length === 0) {
            if (!isAutoReroute) {
                toast.warn("Waiting for GPS lock before optimizing...");
                refreshGPS();
            }
            return;
        }

        // Rate limit auto-rerouting (min 30 seconds between calls)
        const now = Date.now();
        if (isAutoReroute && now - lastRerouteTime.current < 30000) return;
        if (isAutoReroute) lastRerouteTime.current = now;

        try {
            setIsOptimizing(true);
            const uncheckedSites = sites.filter(s => !s.is_checked);
            
            if (uncheckedSites.length === 0) {
                if (!isAutoReroute) toast.info("All sites checked!");
                return;
            }

            // 1. Get optimized order from ORS
            const optimizedSites = await getOptimizedRoute(currentPos, uncheckedSites);
            const checkedSites = sites.filter(s => s.is_checked);
            
            // Set the new optimal order
            setSites([...optimizedSites, ...checkedSites]);
            
            const target = optimizedSites[0];
            setNextSite(target);
            
            // 2. Get route geometry
            let routeCoords = [
                [currentPos.lng, currentPos.lat],
                ...optimizedSites.map(s => [s.longitude, s.latitude])
            ];

            const directionsResult = await getDirections(routeCoords);
            setRouteData(directionsResult);

            // 3. Extract turn-by-turn steps
            if (directionsResult.features && directionsResult.features[0].properties.segments) {
                const allSteps = directionsResult.features[0].properties.segments.flatMap(s => s.steps);
                setNavigationSteps(allSteps);
                setCurrentStepIndex(0);
                
                if (voiceEnabled && allSteps.length > 0) {
                    const msg = isAutoReroute 
                        ? `Off route. Recalculating. Next site: ${target.name}. ${allSteps[0].instruction}`
                        : `Route optimized. First stop: ${target.name}. ${allSteps[0].instruction}`;
                    speak(msg);
                }
            }
            
            if (!isAutoReroute) toast.success("Route Optimized!");
        } catch (error) {
            console.error("Optimization error:", error);
            if (!isAutoReroute) toast.error("Failed to optimize route. Please check your internet connection.");
        } finally {
            setIsOptimizing(false);
        }
    }, [userPos, sites, voiceEnabled, setSites, setNextSite, lastRerouteTime, refreshGPS]);

    // STABLE GPS WATCHER (Prevents flickering and jumping)
    useEffect(() => {
        if (!navigator.geolocation) return;

        let lastPos = null;

        const id = navigator.geolocation.watchPosition(
            (pos) => {
                const currentLat = pos.coords.latitude;
                const currentLng = pos.coords.longitude;
                const p = { lat: currentLat, lng: currentLng };

                // POSITION SMOOTHING (Phase 1 Fix)
                if (lastPos) {
                    const jitter = calculateDistance(lastPos.lat, lastPos.lng, p.lat, p.lng);
                    if (jitter < 3) return; 
                }
                
                lastPos = p;
                setUserPos(p);

                const currentRoute = routeDataRef.current;
                const state = navStateRef.current;

                // 1. Check for Auto-Rerouting (Off-Route Detection)
                if (currentRoute?.features?.[0]?.geometry?.coordinates) {
                    const polyline = currentRoute.features[0].geometry.coordinates;
                    if (isOffRoute(p, polyline, 150)) {
                        optimizeRoute(true, p);
                        return;
                    }
                }

                // 2. Proximity Alert for Site Destination
                if (state.nextSite && voiceEnabled && state.nextSite.id !== state.lastAnnounced) {
                    const dist = calculateDistance(currentLat, currentLng, state.nextSite.latitude, state.nextSite.longitude);
                    if (dist < 100) {
                        speak(`Approaching destination: ${state.nextSite.name}`);
                        setLastAnnouncedId(state.nextSite.id);
                    }
                }

                // 3. Dynamic Turn-by-Turn Guidance (Phase 2: Two-Stage)
                if (state.steps.length > 0 && state.index < state.steps.length - 1) {
                    const nextStep = state.steps[state.index + 1];
                    const coords = currentRoute.features[0].geometry.coordinates;
                    const maneuverPointIdx = nextStep.way_points[0];
                    const maneuverPoint = { lng: coords[maneuverPointIdx][0], lat: coords[maneuverPointIdx][1] };
                    
                    const distToTurn = calculateDistance(currentLat, currentLng, maneuverPoint.lat, maneuverPoint.lng);
                    
                    // Stage 1: Heads-up (150 meters away)
                    if (distToTurn < 150 && distToTurn > 40 && lastHeadsUpIdx.current !== state.index + 1) {
                        if (voiceEnabled) speak(`In 150 meters, ${nextStep.instruction}`);
                        lastHeadsUpIdx.current = state.index + 1;
                    }

                    // Stage 2: Action Prompt (30 meters away)
                    if (distToTurn < 30) {
                        setCurrentStepIndex(prev => prev + 1);
                        if (voiceEnabled) speak(`${nextStep.instruction}`);
                    }
                }
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
        );

        return () => navigator.geolocation.clearWatch(id);
    }, [voiceEnabled, optimizeRoute]); 

    const debouncedSave = useCallback(
        debounce(async (siteId, updates) => {
            if (!siteId || siteId.length !== 36) return;
            try {
                setSavingStatus('Saving...');
                const { error } = await supabase.from('sites').update(updates).eq('id', siteId);
                if (error) throw error;
                setSavingStatus('Saved');
                setTimeout(() => setSavingStatus(''), 2000);
            } catch (err) {
                setSavingStatus('Save failed');
            }
        }, 2000),
        []
    );

    const handleUpdateSite = (id, updates) => {
        const index = sites.findIndex(s => s.id === id);
        updateSite(index, updates);
        if (typeof id === 'string' && id.length === 36) {
            debouncedSave(id, updates);
        }
    };

    const handleDeleteSite = async (id) => {
        if (!window.confirm("Exclude this site?")) return;
        try {
            const index = sites.findIndex(s => s.id === id);
            removeSite(index);
            if (typeof id === 'string' && id.length === 36) {
                await supabase.from('sites').delete().eq('id', id);
            }
            toast.success("Site excluded");
        } catch (error) {
            toast.error("Delete failed");
        }
    };

    const handleAddSite = async (newSite) => {
        try {
            if (currentTrip?.id) {
                const { data, error } = await supabase.from('sites').insert([{
                    trip_id: currentTrip.id,
                    name: newSite.name,
                    latitude: newSite.latitude,
                    longitude: newSite.longitude,
                    order_index: sites.length,
                    is_checked: false
                }]).select().single();
                if (error) throw error;
                setSites([...sites, data]);
            } else {
                setSites([...sites, newSite]);
            }
            toast.success("Site added");
        } catch (error) {
            toast.error("Failed to add site");
        }
    };

    const handleSaveEdit = async (updatedSite) => {
        try {
            const index = sites.findIndex(s => s.id === updatedSite.id);
            updateSite(index, updatedSite);
            if (typeof updatedSite.id === 'string' && updatedSite.id.length === 36) {
                const { error } = await supabase.from('sites').update({
                    name: updatedSite.name,
                    latitude: updatedSite.latitude,
                    longitude: updatedSite.longitude
                }).eq('id', updatedSite.id);
                if (error) throw error;
            }
            toast.success("Site updated");
        } catch (error) {
            toast.error("Update failed");
        }
    };

    const handleCapturePhoto = async (siteId, file) => {
        if (!file || !user) {
            toast.error("User session not found. Please log in again.");
            return;
        }
        
        try {
            setUploadingSites(prev => new Set(prev).add(siteId));
            
            const fileExt = file.name.split('.').pop();
            const fileName = `${siteId}/${Date.now()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            // 1. Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('site-photos')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Record in site_images table (Critical: explicitly include user_id)
            const { error: dbError } = await supabase
                .from('site_images')
                .insert([{
                    site_id: siteId,
                    user_id: user.id, // This matches the RLS policy
                    storage_path: filePath,
                    file_name: file.name
                }]);

            if (dbError) throw dbError;

            toast.success(`Photo synced!`);
        } catch (error) {
            console.error('Upload error details:', error);
            toast.error(`Upload failed: ${error.message || 'Check security settings'}`);
        } finally {
            setUploadingSites(prev => {
                const next = new Set(prev);
                next.delete(siteId);
                return next;
            });
        }
    };

    if (!currentTrip || sites.length === 0) {
        return (
            <Container className="text-center mt-5">
                <h3>No active trip to map</h3>
                <Button onClick={() => navigate('/')}>Dashboard</Button>
            </Container>
        );
    }

    const center = userPos ? [userPos.lat, userPos.lng] : [sites[0].latitude, sites[0].longitude];

    return (
        <Container fluid className="px-2 px-md-4 position-relative">
            {/* Turn-by-Turn Navigation Banner */}
            {navigationSteps.length > 0 && navigationSteps[currentStepIndex] && (
                <div className="nav-banner bg-dark text-white p-3 rounded shadow-lg d-flex align-items-center mb-3">
                    <div className="me-3">
                        <FaLocationArrow size={32} className="text-primary" />
                    </div>
                    <div className="flex-grow-1">
                        <div className="fw-bold fs-5">{navigationSteps[currentStepIndex].instruction}</div>
                        <small className="text-light opacity-75">
                            {navigationSteps[currentStepIndex].distance > 1000 
                                ? `${(navigationSteps[currentStepIndex].distance / 1000).toFixed(1)} km` 
                                : `${navigationSteps[currentStepIndex].distance.toFixed(0)} m`} remaining in this step
                        </small>
                    </div>
                    <div className="d-flex flex-column gap-1">
                        <Button 
                            variant="primary" 
                            size="sm"
                            onClick={() => setCurrentStepIndex(prev => Math.min(prev + 1, navigationSteps.length - 1))}
                        >
                            Next
                        </Button>
                        <Button 
                            variant="outline-light" 
                            size="sm"
                            onClick={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))}
                        >
                            Back
                        </Button>
                    </div>
                </div>
            )}

            <Row className="mb-3 align-items-center">
                <Col>
                    <div className="d-flex align-items-center">
                        <h3 className="mb-0 text-truncate me-2" style={{ maxWidth: '200px' }}>{currentTrip.title}</h3>
                        <Button variant="outline-primary" size="sm" className="rounded-circle" onClick={() => { setEditSiteData(null); setShowModal(true); }}>
                            <FaPlus />
                        </Button>
                    </div>
                    {savingStatus && <small className="text-muted ms-2">{savingStatus}</small>}
                </Col>
                <Col xs="auto" className="d-flex align-items-center">
                    <Button variant="outline-info" className="me-2 rounded-circle" onClick={refreshGPS} title="Refresh GPS">
                        <FaCrosshairs />
                    </Button>
                    <Button variant={voiceEnabled ? "success" : "outline-secondary"} className="me-2 rounded-circle" onClick={() => setVoiceEnabled(!voiceEnabled)}>
                        {voiceEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
                    </Button>
                    <Button variant="primary" className="rounded-pill px-4" onClick={optimizeRoute} disabled={isOptimizing || !userPos}>
                        {isOptimizing ? <Spinner size="sm" /> : <FaRoute className="me-2" />}
                        Optimize
                    </Button>
                </Col>
            </Row>

            <Row className="g-0">
                <Col md={8} lg={9}>
                    <div className="map-container position-relative">
                        <MapContainer center={center} zoom={13} zoomControl={false}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {userPos && <Marker position={[userPos.lat, userPos.lng]} icon={blueIcon} />}
                            {routeData && (
                                <GeoJSON 
                                    key={JSON.stringify(routeData.features[0].geometry.coordinates[0])} 
                                    data={routeData} 
                                    style={{ color: '#3388ff', weight: 5, opacity: 0.7 }} 
                                />
                            )}
                            {sites.map((site) => (
                                <Marker 
                                    key={site.id} 
                                    position={[site.latitude, site.longitude]}
                                    icon={site.is_checked ? greenIcon : (site.id === nextSite?.id ? yellowIcon : redIcon)}
                                >
                                    <Popup minWidth={220}>
                                        <div className="p-1">
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <h6 className="mb-0">{site.name}</h6>
                                                <div className="d-flex align-items-center">
                                                    {uploadingSites.has(site.id) ? (
                                                        <Spinner size="sm" animation="border" variant="primary" className="me-2" />
                                                    ) : (
                                                        <div className="position-relative me-2" style={{ width: '20px', height: '20px' }}>
                                                            <input 
                                                                type="file" 
                                                                accept="image/*" 
                                                                capture="environment"
                                                                className="position-absolute opacity-0 w-100 h-100 cursor-pointer"
                                                                style={{ zIndex: 10, top: 0, left: 0 }}
                                                                onChange={(e) => handleCapturePhoto(site.id, e.target.files[0])}
                                                            />
                                                            <FaCamera size={16} className="text-primary" />
                                                        </div>
                                                    )}
                                                    <Button variant="link" size="sm" className="p-0 me-2" onClick={() => { setEditSiteData(site); setShowModal(true); }}>
                                                        <FaEdit />
                                                    </Button>
                                                    <Button variant="link" size="sm" className="text-danger p-0" onClick={() => handleDeleteSite(site.id)}>
                                                        <FaTrash />
                                                    </Button>
                                                </div>
                                            </div>
                                            <Form.Group className="mb-2">
                                                <Form.Control 
                                                    as="textarea" rows={2} size="sm" placeholder="Notes..."
                                                    value={site.notes || ''}
                                                    onChange={(e) => handleUpdateSite(site.id, { notes: e.target.value })}
                                                />
                                            </Form.Group>
                                            <Button 
                                                size="sm" variant={site.is_checked ? "warning" : "success"} className="w-100"
                                                onClick={() => handleUpdateSite(site.id, { is_checked: !site.is_checked })}
                                            >
                                                {site.is_checked ? 'Uncheck' : 'Check'}
                                            </Button>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                            {userPos && <RecenterAutomatically lat={userPos.lat} lng={userPos.lng} />}
                        </MapContainer>
                    </div>
                </Col>

                {showSidebar && (
                    <Col md={4} lg={3}>
                        <Card className="site-sidebar shadow-sm border-0 ms-md-3">
                            <Card.Header className="bg-white py-3 d-flex justify-content-between">
                                <h5 className="mb-0">Route</h5>
                                <Badge bg="primary">{sites.filter(s => s.is_checked).length}/{sites.length}</Badge>
                            </Card.Header>
                            <ListGroup variant="flush" className="overflow-auto" style={{ height: 'calc(100vh - 250px)' }}>
                                {sites.map((site, index) => (
                                    <ListGroup.Item key={site.id} className={site.id === nextSite?.id ? 'bg-light' : ''}>
                                        <div className="d-flex justify-content-between align-items-center">
                                            <div className="text-truncate">
                                                <Badge bg="secondary" className="me-1">{index + 1}</Badge>
                                                <span className={site.is_checked ? 'text-muted text-decoration-line-through' : 'fw-bold'}>{site.name}</span>
                                            </div>
                                            <div className="d-flex">
                                                <Button variant="link" size="sm" className="p-0 me-2" onClick={() => { setEditSiteData(site); setShowModal(true); }}>
                                                    <FaEdit />
                                                </Button>
                                                <Button variant="link" size="sm" className="text-danger p-0" onClick={() => handleDeleteSite(site.id)}>
                                                    <FaTrash />
                                                </Button>
                                            </div>
                                        </div>
                                    </ListGroup.Item>
                                ))}
                            </ListGroup>
                        </Card>
                    </Col>
                )}
            </Row>
            
            <ManualSiteModal 
                show={showModal} onHide={() => setShowModal(false)} 
                onAdd={handleAddSite} onSave={handleSaveEdit} editData={editSiteData}
            />
        </Container>
    );
};

export default MapView;
