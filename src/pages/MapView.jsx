import { useEffect, useState, useRef } from 'react';
import { Container, Row, Col, Card, Button, ListGroup, Spinner, Form } from 'react-bootstrap';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnimatePresence, motion } from 'framer-motion';
import useTripStore from '../store/useTripStore';
import { useNavigate, useParams } from 'react-router-dom';
import {
    FaRoute, FaVolumeUp, FaVolumeMute, FaLocationArrow, FaPlus,
    FaEdit, FaTrash, FaCrosshairs, FaCamera
} from 'react-icons/fa';
import { getOptimizedRoute, getDirections } from '../services/orsService';
import { useAuth } from '../context/useAuth';
import { toast } from 'react-toastify';
import { speak, isOffRoute } from '../utils/navigationUtils';
import ManualSiteModal from '../components/ManualSiteModal';
import { useGpsPosition } from '../features/navigation/useGpsPosition';
import { evaluateGuidance, findNextSite, OFF_ROUTE_M, HEADS_UP_M } from '../features/navigation/guidance';
import { useSiteSync } from '../features/sites/useSiteSync';
import { isPersistedId } from '../features/sites/siteIds';
import * as siteRepository from '../features/sites/siteRepository';
import { fetchTripWithSites, saveSiteOrder } from '../features/trips/tripRepository';
import './MapView.css';

const AUTO_REROUTE_COOLDOWN_MS = 30000;

// Custom on-brand pin markers (CSS shapes, no external image requests).
// Status keeps the same red/gold/green convention field users already know;
// only the chrome changes. Each site pin also carries its visiting-order
// number so it reads the same as the "Route" sidebar list.
const pinIconCache = new Map();

const getSitePinIcon = (status, label) => {
    const key = `${status}-${label}`;
    if (pinIconCache.has(key)) return pinIconCache.get(key);

    const icon = L.divIcon({
        html: `
            <div class="map-pin is-${status}">
                <span class="map-pin-label">${label}</span>
            </div>
        `,
        className: 'map-pin-wrap',
        iconSize: [30, 40],
        iconAnchor: [15, 38],
        popupAnchor: [0, -36]
    });

    pinIconCache.set(key, icon);
    return icon;
};

const userLocationIcon = L.divIcon({
    html: '<div class="user-dot"><span class="user-dot-pulse"></span></div>',
    className: 'user-dot-wrap',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

// Keeps the map centred on the user while following. Dragging the map turns
// following off, so the user can look around without it snapping back.
const FollowUser = ({ pos, follow, onUserPan }) => {
    const map = useMap();
    useMapEvents({ dragstart: onUserPan });
    useEffect(() => {
        if (follow && pos) map.setView([pos.lat, pos.lng]);
    }, [map, follow, pos]);
    return null;
};

const MapView = () => {
    const { currentTrip, loadTrip, sites, setSites, updateSite, removeSite } = useTripStore();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { tripId } = useParams();
    const [loadError, setLoadError] = useState(null);

    // /map/:tripId opened directly (link, bookmark, another trip in the store):
    // load it. A reload of the same trip reuses the persisted store instead.
    const needsLoad = Boolean(tripId) && currentTrip?.id !== tripId;

    useEffect(() => {
        if (!needsLoad) return;
        let cancelled = false;
        fetchTripWithSites(tripId)
            .then(({ trip, sites: loadedSites }) => {
                if (!cancelled) loadTrip(trip, loadedSites);
            })
            .catch((error) => {
                if (!cancelled) setLoadError(error);
            });
        return () => { cancelled = true; };
    }, [needsLoad, tripId, loadTrip]);
    const [routeData, setRouteData] = useState(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [followUser, setFollowUser] = useState(true);

    // Site Modal States
    const [showModal, setShowModal] = useState(false);
    const [editSiteData, setEditSiteData] = useState(null);

    // Navigation State
    const [navigationSteps, setNavigationSteps] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    const [uploadingSites, setUploadingSites] = useState(new Set());

    // Guidance bookkeeping that must not trigger re-renders
    const lastRerouteTime = useRef(0);
    const lastAnnouncedIdRef = useRef(null);
    const lastHeadsUpIdx = useRef(-1);
    const lastArrivedIdx = useRef(-1);

    // Only highlight a "next stop" once there is an optimized route to follow
    const nextSite = routeData ? findNextSite(sites) : null;

    const { status: savingStatus, queueSiteUpdate, flushSite } = useSiteSync();

    const applyRoute = (directions) => {
        lastHeadsUpIdx.current = -1;
        lastArrivedIdx.current = -1;
        setRouteData(directions);

        const allSteps = directions.features?.[0]?.properties?.segments?.flatMap(s => s.steps) ?? [];
        setNavigationSteps(allSteps);
        setCurrentStepIndex(0);
        return allSteps;
    };

    // Save the optimized order so resuming the trip shows the same route.
    // Not awaited: a failure here shouldn't block navigation.
    const persistOrder = (orderedSites) => {
        const ids = orderedSites.map(s => s.id);
        if (!currentTrip?.id || !ids.every(isPersistedId)) return;
        saveSiteOrder(ids).catch((error) => {
            console.error('Saving route order failed:', error);
            toast.warn("Route order couldn't be saved; it will be recalculated next time.");
        });
    };

    const optimizeRoute = async (isAutoReroute, currentPos) => {
        if (!currentPos || sites.length === 0) return;

        const now = Date.now();
        if (isAutoReroute && now - lastRerouteTime.current < AUTO_REROUTE_COOLDOWN_MS) return;
        if (isAutoReroute) lastRerouteTime.current = now;

        try {
            setIsOptimizing(true);
            const uncheckedSites = sites.filter(s => !s.is_checked);

            if (uncheckedSites.length === 0) {
                if (!isAutoReroute) toast.info("All sites checked!");
                return;
            }

            const optimizedSites = await getOptimizedRoute(currentPos, uncheckedSites);

            // Reorder the LATEST sites rather than the snapshot taken before the
            // request, so edits made while optimizing (e.g. a check) aren't reverted.
            const latest = useTripStore.getState().sites;
            const byId = new Map(latest.map(s => [s.id, s]));
            const optimizedIds = new Set(optimizedSites.map(s => s.id));
            const reordered = [
                ...optimizedSites.map(s => byId.get(s.id)).filter(Boolean),
                ...latest.filter(s => !optimizedIds.has(s.id))
            ];
            setSites(reordered);
            persistOrder(reordered);

            const target = optimizedSites[0];
            const routeCoords = [
                [currentPos.lng, currentPos.lat],
                ...optimizedSites.map(s => [s.longitude, s.latitude])
            ];

            const allSteps = applyRoute(await getDirections(routeCoords));

            if (voiceEnabled && allSteps.length > 0) {
                const msg = isAutoReroute
                    ? `Off route. Recalculating. Next site: ${target.name}. ${allSteps[0].instruction}`
                    : `Route optimized. First stop: ${target.name}. ${allSteps[0].instruction}`;
                speak(msg);
            }

            if (!isAutoReroute) toast.success("Route Optimized!");
        } catch (error) {
            console.error("Optimization error:", error);
            if (!isAutoReroute) {
                toast.error("Failed to optimize route.");
            } else {
                toast.error("Auto-reroute failed. Tap Optimize to try again.");
            }
        } finally {
            setIsOptimizing(false);
        }
    };

    // Called on every accepted GPS fix (see useGpsPosition); always sees the
    // latest render's route, sites and settings.
    const handleFix = (p) => {
        const coords = routeData?.features?.[0]?.geometry?.coordinates ?? null;

        if (coords && isOffRoute(p, coords, OFF_ROUTE_M)) {
            optimizeRoute(true, p);
        }

        const { approachingSite, headsUp, arrive } = evaluateGuidance({
            pos: p,
            nextSite,
            lastAnnouncedId: lastAnnouncedIdRef.current,
            steps: navigationSteps,
            stepIdx: currentStepIndex,
            coords,
            lastHeadsUpIdx: lastHeadsUpIdx.current,
            lastArrivedIdx: lastArrivedIdx.current
        });

        let spokeThisTick = false;
        if (approachingSite && voiceEnabled) {
            speak(`Approaching destination: ${approachingSite.name}`);
            lastAnnouncedIdRef.current = approachingSite.id;
            spokeThisTick = true;
        }
        if (headsUp) {
            lastHeadsUpIdx.current = headsUp.index;
            if (voiceEnabled && !spokeThisTick) speak(`In ${HEADS_UP_M} meters, ${headsUp.step.instruction}`);
        }
        if (arrive) {
            lastArrivedIdx.current = arrive.index;
            setCurrentStepIndex(arrive.index);
            if (voiceEnabled && !spokeThisTick) speak(arrive.step.instruction);
        }
    };

    const { userPos, refreshGPS } = useGpsPosition(handleFix);

    const handleOptimizeClick = () => {
        if (!userPos) {
            toast.warn("Waiting for GPS lock before optimizing...");
            refreshGPS();
            return;
        }
        optimizeRoute(false, userPos);
    };

    const toggleVoice = () => {
        const next = !voiceEnabled;
        setVoiceEnabled(next);
        if (next) {
            // Speaking here, inside the real click, both confirms audibly that
            // voice is on and "unlocks" speech synthesis on browsers (notably
            // iOS Safari) that silently block speak() calls made later from an
            // async callback with no user gesture in the stack.
            speak('Voice guidance enabled');
        } else if ('speechSynthesis' in window) {
            // Stop a line that is still playing, not just future ones
            window.speechSynthesis.cancel();
        }
    };

    const handleUpdateSite = (id, updates) => {
        const index = sites.findIndex(s => s.id === id);
        updateSite(index, updates);
        if (isPersistedId(id)) queueSiteUpdate(id, updates);
    };

    // Checking is a deliberate action: save it (and any pending notes for the
    // site) immediately rather than waiting for the debounce
    const handleToggleChecked = (site) => {
        handleUpdateSite(site.id, { is_checked: !site.is_checked });
        if (isPersistedId(site.id)) flushSite(site.id);
    };

    const handleDeleteSite = async (id) => {
        if (!window.confirm("Exclude this site?")) return;
        try {
            const index = sites.findIndex(s => s.id === id);
            removeSite(index);
            if (isPersistedId(id)) await siteRepository.deleteSite(id);
            toast.success("Site excluded");
        } catch {
            toast.error("Delete failed");
        }
    };

    const handleAddSite = async (newSite) => {
        try {
            if (currentTrip?.id) {
                const saved = await siteRepository.insertSite(currentTrip.id, newSite, sites.length);
                setSites([...sites, saved]);
            } else {
                setSites([...sites, newSite]);
            }
            toast.success("Site added");
        } catch {
            toast.error("Failed to add site");
        }
    };

    const handleSaveEdit = async (updatedSite) => {
        try {
            const index = sites.findIndex(s => s.id === updatedSite.id);
            updateSite(index, updatedSite);
            if (isPersistedId(updatedSite.id)) {
                await siteRepository.updateSite(updatedSite.id, {
                    name: updatedSite.name,
                    latitude: updatedSite.latitude,
                    longitude: updatedSite.longitude
                });
            }
            toast.success("Site updated");
        } catch {
            toast.error("Update failed");
        }
    };

    const handleCapturePhoto = async (siteId, file) => {
        if (!file) return;
        if (!user) {
            toast.error("User session not found. Please log in again.");
            return;
        }
        if (!isPersistedId(siteId)) {
            toast.error("Save the trip before adding photos.");
            return;
        }

        try {
            setUploadingSites(prev => new Set(prev).add(siteId));
            await siteRepository.uploadSitePhoto({ userId: user.id, siteId, file });
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

    if (loadError) {
        return (
            <Container className="text-center mt-5">
                <h3>Couldn't load this trip</h3>
                <p className="text-muted">It may have been deleted, or you may be offline.</p>
                <Button onClick={() => navigate('/dashboard')}>Dashboard</Button>
            </Container>
        );
    }

    if (needsLoad) {
        return (
            <Container className="text-center mt-5">
                <Spinner animation="border" role="status" />
                <p className="text-muted mt-3">Loading trip...</p>
            </Container>
        );
    }

    if (!currentTrip || sites.length === 0) {
        return (
            <Container className="text-center mt-5">
                <h3>No active trip to map</h3>
                <Button onClick={() => navigate('/dashboard')}>Dashboard</Button>
            </Container>
        );
    }

    const center = userPos ? [userPos.lat, userPos.lng] : [sites[0].latitude, sites[0].longitude];

    return (
        <Container fluid className="px-2 px-md-4 position-relative">
            {/* Turn-by-Turn Navigation Banner */}
            <AnimatePresence>
                {navigationSteps.length > 0 && navigationSteps[currentStepIndex] && (
                    <motion.div
                        key="nav-banner"
                        initial={{ opacity: 0, y: -16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="nav-banner p-3 d-flex align-items-center mb-3"
                    >
                        <div className="me-3">
                            <FaLocationArrow size={32} />
                        </div>
                        <div className="flex-grow-1">
                            <div className="fw-bold fs-5">{navigationSteps[currentStepIndex].instruction}</div>
                            <small className="opacity-75">
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
                    </motion.div>
                )}
            </AnimatePresence>

            <Row className="map-toolbar mb-3 align-items-center">
                <Col>
                    <div className="d-flex align-items-center">
                        <h3 className="mb-0 text-truncate me-2 fw-bold" style={{ maxWidth: '200px', color: 'var(--ink)' }}>{currentTrip.title}</h3>
                        <motion.span whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} className="d-inline-block">
                            <Button
                                variant="outline-primary"
                                className="toolbar-icon-btn"
                                onClick={() => { setEditSiteData(null); setShowModal(true); }}
                                title="Add site"
                                aria-label="Add site"
                            >
                                <FaPlus />
                            </Button>
                        </motion.span>
                    </div>
                    {savingStatus && <small className="text-muted ms-2">{savingStatus}</small>}
                </Col>
                <Col xs="auto" className="d-flex align-items-center">
                    <motion.span whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} className="d-inline-block me-2">
                        <Button
                            variant="outline-info"
                            className="toolbar-icon-btn"
                            onClick={refreshGPS}
                            title="Refresh GPS"
                            aria-label="Refresh GPS"
                        >
                            <FaCrosshairs />
                        </Button>
                    </motion.span>
                    <motion.span whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} className="d-inline-block me-2">
                        <Button
                            variant={voiceEnabled ? "primary" : "outline-secondary"}
                            className="toolbar-icon-btn"
                            onClick={toggleVoice}
                            title={voiceEnabled ? "Disable voice guidance" : "Enable voice guidance"}
                            aria-label={voiceEnabled ? "Disable voice guidance" : "Enable voice guidance"}
                        >
                            {voiceEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
                        </Button>
                    </motion.span>
                    <Button variant="primary" className="rounded-pill px-4" onClick={handleOptimizeClick} disabled={isOptimizing || !userPos}>
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
                            {userPos && <Marker position={[userPos.lat, userPos.lng]} icon={userLocationIcon} zIndexOffset={1000} />}
                            {routeData && (
                                <GeoJSON
                                    key={JSON.stringify(routeData.features[0].geometry.coordinates[0])}
                                    data={routeData}
                                    style={{ color: '#2563EB', weight: 5, opacity: 0.75 }}
                                />
                            )}
                            {sites.map((site, index) => (
                                <Marker
                                    key={site.id}
                                    position={[site.latitude, site.longitude]}
                                    icon={getSitePinIcon(
                                        site.is_checked ? 'checked' : (site.id === nextSite?.id ? 'next' : 'pending'),
                                        index + 1
                                    )}
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
                                                                aria-label={`Add photo for ${site.name}`}
                                                                onChange={(e) => handleCapturePhoto(site.id, e.target.files[0])}
                                                            />
                                                            <FaCamera size={16} className="text-primary" />
                                                        </div>
                                                    )}
                                                    <Button variant="link" size="sm" className="p-0 me-2" aria-label={`Edit ${site.name}`} onClick={() => { setEditSiteData(site); setShowModal(true); }}>
                                                        <FaEdit />
                                                    </Button>
                                                    <Button variant="link" size="sm" className="text-danger p-0" aria-label={`Delete ${site.name}`} onClick={() => handleDeleteSite(site.id)}>
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
                                                onClick={() => handleToggleChecked(site)}
                                            >
                                                {site.is_checked ? 'Uncheck' : 'Check'}
                                            </Button>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                            <FollowUser pos={userPos} follow={followUser} onUserPan={() => setFollowUser(false)} />
                        </MapContainer>
                        {!followUser && userPos && (
                            <Button
                                variant="light"
                                className="map-recenter-btn"
                                onClick={() => setFollowUser(true)}
                                title="Follow my location"
                                aria-label="Follow my location"
                            >
                                <FaLocationArrow />
                            </Button>
                        )}
                    </div>
                </Col>

                <Col md={4} lg={3}>
                    <Card className="site-sidebar border-0 ms-md-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
                        <Card.Header className="bg-white py-3 d-flex justify-content-between">
                            <h5 className="mb-0 fw-bold" style={{ color: 'var(--ink)' }}>Route</h5>
                            <span className="status-badge is-accent">{sites.filter(s => s.is_checked).length}/{sites.length}</span>
                        </Card.Header>
                        <ListGroup variant="flush" className="overflow-auto" style={{ height: 'calc(100vh - 250px)' }}>
                            {sites.map((site, index) => (
                                <ListGroup.Item key={site.id} className={site.id === nextSite?.id ? 'is-next-stop' : ''}>
                                    <div className="d-flex justify-content-between align-items-center">
                                        <div className="text-truncate d-flex align-items-center">
                                            <span className={`site-order-dot ${site.is_checked ? 'is-checked' : site.id === nextSite?.id ? 'is-next' : ''}`}>{index + 1}</span>
                                            <span className={site.is_checked ? 'text-muted text-decoration-line-through' : 'fw-bold'} style={{ color: site.is_checked ? undefined : 'var(--ink)' }}>{site.name}</span>
                                        </div>
                                        <div className="d-flex">
                                            <Button variant="link" size="sm" className="p-0 me-2" aria-label={`Edit ${site.name}`} onClick={() => { setEditSiteData(site); setShowModal(true); }}>
                                                <FaEdit />
                                            </Button>
                                            <Button variant="link" size="sm" className="text-danger p-0" aria-label={`Delete ${site.name}`} onClick={() => handleDeleteSite(site.id)}>
                                                <FaTrash />
                                            </Button>
                                        </div>
                                    </div>
                                </ListGroup.Item>
                            ))}
                        </ListGroup>
                    </Card>
                </Col>
            </Row>

            <ManualSiteModal
                show={showModal} onHide={() => setShowModal(false)}
                onAdd={handleAddSite} onSave={handleSaveEdit} editData={editSiteData}
            />
        </Container>
    );
};

export default MapView;
