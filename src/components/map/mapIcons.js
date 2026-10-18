import L from 'leaflet';
import './mapMarkers.css';

// divIcons are plain HTML (no image requests); cached so Leaflet doesn't
// rebuild every marker's DOM on each GPS tick
const pinCache = new Map();

/**
 * @param {'pending'|'next'|'checked'} status
 * @param {number} label  visiting-order number, matching the site list
 */
export const sitePinIcon = (status, label, selected = false) => {
    const key = `${status}-${label}-${selected}`;
    if (!pinCache.has(key)) {
        pinCache.set(key, L.divIcon({
            html: `<div class="ro-pin is-${status}${selected ? ' is-selected' : ''}"><span>${label}</span></div>`,
            className: 'ro-marker',
            iconSize: [34, 42],
            // The rotated square's tip sits about 1.2x its size below the top
            iconAnchor: [17, selected ? 41 : 34],
        }));
    }
    return pinCache.get(key);
};

export const userLocationIcon = L.divIcon({
    html: '<div class="ro-user-dot"></div>',
    className: 'ro-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});
