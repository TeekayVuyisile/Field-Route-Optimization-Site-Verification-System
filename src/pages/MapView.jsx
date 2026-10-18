import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import useTripStore from '../store/useTripStore';
import { useNavigate, useParams } from 'react-router-dom';
import {
    LuChevronDown, LuChevronUp, LuCircleCheckBig, LuCrosshair, LuLocateFixed, LuMap, LuPlus,
    LuRoute, LuTriangleAlert, LuVolume2, LuVolumeX
} from 'react-icons/lu';
import { getOptimizedRoute, getDirections } from '../services/orsService';
import { straightLineRoute, isFallbackRoute } from '../features/navigation/routeChunks';
import { useAuth } from '../context/useAuth';
import { toast } from 'react-toastify';
import { speak, isOffRoute } from '../utils/navigationUtils';
import { useGpsPosition } from '../features/navigation/useGpsPosition';
import { evaluateGuidance, findNextSite, OFF_ROUTE_M, HEADS_UP_M } from '../features/navigation/guidance';
import { outbox } from '../features/offline';
import { useOnline, useOutboxStatus } from '../features/offline/useOutbox';
import { compressImage } from '../features/photos/compressImage';
import { isPersistedId } from '../features/sites/siteIds';
import * as siteRepository from '../features/sites/siteRepository';
import { fetchTripWithSites, saveSiteOrder } from '../features/trips/tripRepository';
import { statusFromProgress } from '../features/trips/tripStatus';
import { calculateDistance } from '../lib/geo';
import { countLabel } from '../lib/format';
import { sitePinIcon, userLocationIcon } from '../components/map/mapIcons';
import InstructionBanner from '../components/map/InstructionBanner';
import StopCard from '../components/map/StopCard';
import SiteList from '../components/map/SiteList';
import SiteFormDialog from '../components/trips/SiteFormDialog';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/primitives';
import { cn } from '../components/ui/cn';

const AUTO_REROUTE_COOLDOWN_MS = 30000;

const mapControl = 'grid size-11 cursor-pointer place-items-center rounded-full border border-border bg-surface text-fg shadow-raised transition-colors duration-200 hover:bg-surface-2';

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

// Pans to a stop picked from the list. `request` is a new object per pick,
// so picking the same stop again still pans back to it.
const FocusSite = ({ request }) => {
    const map = useMap();
    useEffect(() => {
        if (request) map.setView([request.lat, request.lng], Math.max(map.getZoom(), 15));
    }, [map, request]);
    return null;
};

// Frames every stop once when the map opens. Following the user from the
// start could land 400 km away from the trip (or wherever an IP-based
// location says), with no pins in sight.
const FitSitesOnce = ({ sites }) => {
    const map = useMap();
    const [points] = useState(() => sites.map((s) => [s.latitude, s.longitude]));
    useEffect(() => {
        if (points.length === 1) map.setView(points[0], 15);
        else map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    }, [map, points]);
    return null;
};

// The stop panel grows and shrinks on phones; Leaflet only notices window
// resizes, so tell it when its own box changes
const TrackMapSize = () => {
    const map = useMap();
    useEffect(() => {
        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(map.getContainer());
        return () => observer.disconnect();
    }, [map]);
    return null;
};

const MapView = () => {
    const { currentTrip, loadTrip, setCurrentTrip, sites, setSites, updateSite, removeSite } = useTripStore();
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
    // Following starts with navigation (Optimize) or the follow button
    const [followUser, setFollowUser] = useState(false);

    // Stop panel: which stop it shows (null = the next one), whether the full
    // list is open on phones, and the add/edit/remove dialogs
    const [selectedId, setSelectedId] = useState(null);
    const [listOpen, setListOpen] = useState(false);
    const [focusRequest, setFocusRequest] = useState(null);
    const [siteDialog, setSiteDialog] = useState(null); // { site } | { site: null } to add
    const [siteToDelete, setSiteToDelete] = useState(null);

    // Navigation State
    const [navigationSteps, setNavigationSteps] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    // Sites whose photo is being compressed (a second or two on big photos)
    const [preparingPhoto, setPreparingPhoto] = useState(new Set());

    // Guidance bookkeeping that must not trigger re-renders
    const lastRerouteTime = useRef(0);
    const lastAnnouncedIdRef = useRef(null);
    const lastHeadsUpIdx = useRef(-1);
    const lastArrivedIdx = useRef(-1);

    // Only highlight a "next stop" once there is an optimized route to follow
    const nextSite = routeData ? findNextSite(sites) : null;

    const online = useOnline();
    const sync = useOutboxStatus();

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
            if (!isAutoReroute) {
                setSelectedId(null);
                setFollowUser(true);
            }

            const target = optimizedSites[0];
            const routeCoords = [
                [currentPos.lng, currentPos.lat],
                ...optimizedSites.map(s => [s.longitude, s.latitude])
            ];

            let directions;
            try {
                directions = await getDirections(routeCoords);
            } catch (directionsError) {
                // Keep the driver moving: the visiting order is already known, so
                // show it as straight lines and still announce stops on arrival
                console.error('Directions unavailable:', directionsError);
                applyRoute(straightLineRoute(routeCoords));
                toast.warn("Turn-by-turn directions are unavailable right now. Showing your stops in order with straight lines.");
                if (voiceEnabled) speak(`Stops ordered. First stop: ${target.name}. Turn by turn directions are unavailable.`);
                return;
            }

            const allSteps = applyRoute(directions);

            if (voiceEnabled && allSteps.length > 0) {
                const msg = isAutoReroute
                    ? `Off route. Recalculating. Next site: ${target.name}. ${allSteps[0].instruction}`
                    : `Route optimized. First stop: ${target.name}. ${allSteps[0].instruction}`;
                speak(msg);
            }

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

        // Straight-line fallback routes don't follow roads, so "off route" is meaningless there
        if (coords && !isFallbackRoute(routeData) && isOffRoute(p, coords, OFF_ROUTE_M)) {
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
        if (isPersistedId(id)) outbox.update('site', id, updates);
    };

    // Checking is a deliberate action: send it (and any pending notes for the
    // site) at once rather than after the debounce
    const handleToggleChecked = (site) => {
        updateSite(sites.findIndex(s => s.id === site.id), { is_checked: !site.is_checked });
        if (isPersistedId(site.id)) outbox.update('site', site.id, { is_checked: !site.is_checked }, { immediate: true });
        syncTripStatus(useTripStore.getState().sites);
        // After a check-in the panel moves on to the next stop
        if (!site.is_checked) setSelectedId(null);
    };

    // First check starts the trip, last check completes it (the database
    // stamps started_at / completed_at). Managers see this on the dashboard.
    const syncTripStatus = (latestSites) => {
        if (!currentTrip?.id) return;
        const next = statusFromProgress(currentTrip.status ?? 'draft', latestSites);
        if (next === currentTrip.status) return;

        setCurrentTrip({ ...currentTrip, status: next });
        outbox.update('trip', currentTrip.id, { status: next }, { immediate: true });
        if (next === 'completed') toast.success('All sites checked. Trip completed!');
    };

    // Adding and removing sites write straight to the database (a new site
    // needs its real id before anything else can refer to it)
    const needsSignal = (action) => {
        if (navigator.onLine) return false;
        toast.warn(`You're offline. ${action} needs signal; check-ins, notes and photos still work.`);
        return true;
    };

    const handleDeleteSite = async () => {
        const site = siteToDelete;
        setSiteToDelete(null);
        if (isPersistedId(site.id) && needsSignal('Removing a site')) return;
        try {
            removeSite(sites.findIndex(s => s.id === site.id));
            if (selectedId === site.id) setSelectedId(null);
            if (isPersistedId(site.id)) await siteRepository.deleteSite(site.id);
            toast.success(`${site.name} removed from the trip`);
        } catch {
            toast.error("Couldn't remove the site. Reload and try again.");
        }
    };

    const warnIfOutside = (site) => {
        if (!site.isValid) toast.warn(`${site.name} is outside South Africa. Check its coordinates.`);
    };

    const handleAddSite = async (newSite) => {
        setSiteDialog(null);
        if (currentTrip?.id && needsSignal('Adding a site')) return;
        try {
            if (currentTrip?.id) {
                const saved = await siteRepository.insertSite(currentTrip.id, newSite, sites.length);
                setSites([...useTripStore.getState().sites, saved]);
            } else {
                setSites([...useTripStore.getState().sites, newSite]);
            }
            toast.success(`${newSite.name} added`);
            warnIfOutside(newSite);
        } catch {
            toast.error("Couldn't add the site. Try again.");
        }
    };

    const handleSaveEdit = (updatedSite) => {
        setSiteDialog(null);
        updateSite(sites.findIndex(s => s.id === updatedSite.id), updatedSite);
        if (isPersistedId(updatedSite.id)) {
            const { name, latitude, longitude } = updatedSite;
            outbox.update('site', updatedSite.id, { name, latitude, longitude }, { immediate: true });
        }
        toast.success("Site updated");
        warnIfOutside(updatedSite);
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

        // Compressed, then kept on the phone until it's uploaded: a photo
        // taken without signal is never lost
        setPreparingPhoto(prev => new Set(prev).add(siteId));
        try {
            const compressed = await compressImage(file);
            outbox.add('photo', { id: crypto.randomUUID(), userId: user.id, siteId, file: compressed, fileName: file.name });
            toast.success(navigator.onLine ? 'Photo saved' : "Photo saved on this phone. It'll upload when you have signal.");
        } finally {
            setPreparingPhoto(prev => {
                const next = new Set(prev);
                next.delete(siteId);
                return next;
            });
        }
    };

    const selectSite = (id, { pan = false } = {}) => {
        setSelectedId(id);
        setListOpen(false);
        if (pan) {
            const site = sites.find(s => s.id === id);
            setFollowUser(false);
            setFocusRequest({ lat: site.latitude, lng: site.longitude });
        }
    };

    if (loadError) {
        return (
            <div className="mx-auto max-w-lg px-4 py-10">
                <EmptyState
                    icon={LuTriangleAlert}
                    title="Couldn't load this trip"
                    action={<Button onClick={() => navigate('/dashboard')}>Back to trips</Button>}
                >
                    It may have been deleted, or you may be offline.
                </EmptyState>
            </div>
        );
    }

    if (needsLoad) {
        return (
            <div className="grid min-h-[50dvh] place-items-center text-muted">
                <Spinner className="size-6" label="Loading trip" />
            </div>
        );
    }

    if (!currentTrip || sites.length === 0) {
        return (
            <div className="mx-auto max-w-lg px-4 py-10">
                <EmptyState
                    icon={LuMap}
                    title="No trip open"
                    action={<Button to="/dashboard">Choose a trip</Button>}
                >
                    Open a trip from your list to see its stops and start driving.
                </EmptyState>
            </div>
        );
    }

    const checkedCount = sites.filter(s => s.is_checked).length;
    // `sync` re-renders this on every outbox change, so these stay current
    const queuedPhotos = outbox.pendingItems('photo');
    const syncLabel = !online ? 'Offline, saving on this phone'
        : sync.syncing ? 'Saving...'
        : sync.pending > 0 ? 'Waiting to save' : '';
    const allChecked = checkedCount === sites.length;
    const selectedSite = sites.find(s => s.id === selectedId) ?? nextSite ?? sites.find(s => !s.is_checked) ?? null;
    const selectedIndex = sites.indexOf(selectedSite);
    const step = navigationSteps[currentStepIndex];
    const distanceToSelected = userPos && selectedSite
        ? calculateDistance(userPos.lat, userPos.lng, selectedSite.latitude, selectedSite.longitude)
        : null;

    return (
        // Fills the screen between the top bar and the phone tab bar.
        // `isolate` keeps Leaflet's z-indexes (400+) under the app chrome.
        <div className="fixed inset-x-0 top-16 bottom-[calc(4rem+env(safe-area-inset-bottom))] isolate flex flex-col bg-canvas md:bottom-0 md:flex-row">
            <div className="relative min-h-0 flex-1">
                <MapContainer center={[sites[0].latitude, sites[0].longitude]} zoom={13} zoomControl={false} className="h-full w-full">
                    {/* OSM's tile usage policy requires visible attribution */}
                    <TileLayer
                        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                        crossOrigin="anonymous"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    {userPos && <Marker position={[userPos.lat, userPos.lng]} icon={userLocationIcon} zIndexOffset={1000} />}
                    {routeData && (
                        <GeoJSON
                            key={JSON.stringify(routeData.features[0].geometry.coordinates[0])}
                            data={routeData}
                            style={isFallbackRoute(routeData)
                                ? { color: '#64748B', weight: 3, opacity: 0.8, dashArray: '8 8' }
                                : { color: '#2563EB', weight: 5, opacity: 0.75 }}
                        />
                    )}
                    {sites.map((site, index) => (
                        <Marker
                            key={site.id}
                            position={[site.latitude, site.longitude]}
                            title={site.name}
                            icon={sitePinIcon(
                                site.is_checked ? 'checked' : (site.id === nextSite?.id ? 'next' : 'pending'),
                                index + 1,
                                site.id === selectedSite?.id
                            )}
                            zIndexOffset={site.id === selectedSite?.id ? 500 : 0}
                            eventHandlers={{ click: () => selectSite(site.id) }}
                        />
                    ))}
                    <FollowUser pos={userPos} follow={followUser} onUserPan={() => setFollowUser(false)} />
                    <FitSitesOnce sites={sites} />
                    <FocusSite request={focusRequest} />
                    <TrackMapSize />
                </MapContainer>

                <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-start gap-2 p-3">
                    <div className="pointer-events-auto min-w-0 flex-1">
                        {step ? (
                            <InstructionBanner
                                step={step}
                                index={currentStepIndex}
                                total={navigationSteps.length}
                                onPrevious={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))}
                                onNext={() => setCurrentStepIndex(prev => Math.min(prev + 1, navigationSteps.length - 1))}
                            />
                        ) : !userPos ? (
                            <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-sm font-semibold text-muted shadow-raised">
                                <Spinner className="size-4" label="Finding your location" /> Finding your location...
                            </p>
                        ) : null}
                        {routeData && isFallbackRoute(routeData) && (
                            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-2 text-sm font-semibold text-warning shadow-raised">
                                <LuTriangleAlert className="size-4" aria-hidden /> Straight lines only: directions unavailable
                            </p>
                        )}
                    </div>
                    <div className="pointer-events-auto flex shrink-0 flex-col gap-2">
                        <button
                            type="button"
                            className={cn(mapControl, voiceEnabled && 'border-accent bg-accent text-accent-fg hover:bg-accent-hover')}
                            onClick={toggleVoice}
                            aria-pressed={voiceEnabled}
                            aria-label="Voice guidance"
                            title={voiceEnabled ? 'Voice guidance on' : 'Voice guidance off'}
                        >
                            {voiceEnabled ? <LuVolume2 className="size-5" /> : <LuVolumeX className="size-5" />}
                        </button>
                        <button type="button" className={mapControl} onClick={() => refreshGPS()} aria-label="Refresh GPS" title="Refresh GPS">
                            <LuCrosshair className="size-5" />
                        </button>
                        {!followUser && userPos && (
                            <button
                                type="button"
                                className={cn(mapControl, 'text-accent')}
                                onClick={() => setFollowUser(true)}
                                aria-label="Follow my location"
                                title="Follow my location"
                            >
                                <LuLocateFixed className="size-5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <aside
                className={cn(
                    'relative z-[1000] flex flex-col border-t border-border bg-surface shadow-overlay',
                    'md:w-96 md:max-h-none md:border-t-0 md:border-l md:shadow-none',
                    listOpen ? 'max-h-[75%]' : 'max-h-[60%]'
                )}
                aria-label="Stops"
            >
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate font-bold">{currentTrip.title}</h1>
                        <p className="text-xs text-muted">
                            {checkedCount} of {countLabel(sites.length, 'stop')} visited
                            {syncLabel && <span className={online ? 'text-faint' : 'font-semibold text-warning'}> · {syncLabel}</span>}
                        </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSiteDialog({ site: null })} aria-label="Add a site" title="Add a site">
                        <LuPlus className="size-5" />
                    </Button>
                    {!allChecked && (
                        <Button
                            variant={routeData ? 'secondary' : 'primary'}
                            onClick={handleOptimizeClick}
                            loading={isOptimizing}
                            disabled={!userPos}
                            title={userPos ? undefined : 'Waiting for your location'}
                        >
                            {!isOptimizing && <LuRoute className="size-4" aria-hidden />}
                            {routeData ? 'Re-route' : 'Optimize'}
                        </Button>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="p-4">
                        {allChecked ? (
                            <div className="flex flex-col items-center gap-3 py-4 text-center">
                                <span className="grid size-12 place-items-center rounded-2xl bg-success-soft text-success">
                                    <LuCircleCheckBig className="size-6" aria-hidden />
                                </span>
                                <div>
                                    <h2 className="font-bold">Every stop visited</h2>
                                    <p className="mt-1 text-sm text-muted">Check the report, then export it for your records.</p>
                                </div>
                                {currentTrip.id && <Button to={`/trip-review/${currentTrip.id}`}>View trip report</Button>}
                            </div>
                        ) : selectedSite && (
                            <StopCard
                                key={selectedSite.id}
                                site={selectedSite}
                                number={selectedIndex + 1}
                                total={sites.length}
                                isNext={selectedSite.id === nextSite?.id}
                                distance={distanceToSelected}
                                preparingPhoto={preparingPhoto.has(selectedSite.id)}
                                queuedPhotos={queuedPhotos.filter((p) => p.siteId === selectedSite.id).length}
                                onToggleChecked={() => handleToggleChecked(selectedSite)}
                                onPhoto={(file) => handleCapturePhoto(selectedSite.id, file)}
                                onNotesChange={(notes) => handleUpdateSite(selectedSite.id, { notes })}
                                onEdit={() => setSiteDialog({ site: selectedSite })}
                                onDelete={() => setSiteToDelete(selectedSite)}
                            />
                        )}
                    </div>

                    {/* Phones: the list folds away so the map keeps most of the screen */}
                    <button
                        type="button"
                        className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 border-t border-border text-sm font-semibold text-muted transition-colors duration-200 hover:bg-surface-2 md:hidden"
                        onClick={() => setListOpen(!listOpen)}
                        aria-expanded={listOpen}
                        aria-controls="map-site-list"
                    >
                        {listOpen ? <LuChevronDown className="size-4" aria-hidden /> : <LuChevronUp className="size-4" aria-hidden />}
                        {listOpen ? 'Hide stops' : `All ${countLabel(sites.length, 'stop')}`}
                    </button>
                    <div id="map-site-list" className={cn('border-t border-border', !listOpen && 'hidden md:block')}>
                        <SiteList
                            sites={sites}
                            nextId={nextSite?.id}
                            selectedId={selectedSite?.id}
                            onSelect={(id) => selectSite(id, { pan: true })}
                        />
                    </div>
                </div>
            </aside>

            {siteDialog && (
                <SiteFormDialog
                    key={siteDialog.site?.id ?? 'new'}
                    open
                    onOpenChange={(open) => { if (!open) setSiteDialog(null); }}
                    site={siteDialog.site}
                    onSubmit={siteDialog.site ? handleSaveEdit : handleAddSite}
                />
            )}
            <ConfirmDialog
                open={Boolean(siteToDelete)}
                onOpenChange={(open) => { if (!open) setSiteToDelete(null); }}
                title={`Remove ${siteToDelete?.name ?? 'this site'}?`}
                description="It's taken off this trip for everyone, along with its notes and photos. This can't be undone."
                confirmLabel="Remove site"
                onConfirm={handleDeleteSite}
            />
        </div>
    );
};

export default MapView;
