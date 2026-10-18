import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Status colours match the review list badges
const COLORS = { ready: '#2563EB', outside: '#B45309' };

const FitToSites = ({ points }) => {
    const map = useMap();
    useEffect(() => {
        if (points.length === 1) map.setView(points[0], 13);
        else if (points.length > 1) map.fitBounds(points, { padding: [28, 28], maxZoom: 14 });
    }, [map, points]);
    return null;
};

/**
 * Read-only preview of staged sites, so a bad import (wrong columns, swapped
 * coordinates) is obvious before anything is saved. Loaded lazily: Leaflet
 * only downloads when the review step is shown.
 */
const SitesPreviewMap = ({ sites }) => {
    // Recomputed only when the sites change, so the map doesn't re-fit on
    // unrelated re-renders (e.g. opening the edit dialog)
    const readable = useMemo(
        () => sites.filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)),
        [sites]
    );
    const points = useMemo(() => readable.map((s) => [s.latitude, s.longitude]), [readable]);

    return (
        <MapContainer
            center={points[0] ?? [-28.5, 24.7]}
            zoom={points.length ? 10 : 5}
            scrollWheelZoom={false}
            className="h-full w-full"
        >
            {/* OSM's tile usage policy requires visible attribution */}
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {readable.map((site) => (
                <CircleMarker
                    key={site.id}
                    center={[site.latitude, site.longitude]}
                    radius={7}
                    pathOptions={{
                        color: '#fff',
                        weight: 2,
                        fillColor: site.isValid ? COLORS.ready : COLORS.outside,
                        fillOpacity: 1
                    }}
                >
                    <Tooltip>{site.name}</Tooltip>
                </CircleMarker>
            ))}
            <FitToSites points={points} />
        </MapContainer>
    );
};

export default SitesPreviewMap;
