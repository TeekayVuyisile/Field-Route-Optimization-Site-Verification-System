/**
 * Utility to speak text using Web Speech API
 * @param {string} text 
 */
export const speak = (text) => {
    if (!('speechSynthesis' in window)) return;
    
    // Cancel any ongoing speech to avoid overlap
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slightly slower for better clarity
    utterance.pitch = 1.0;
    
    // Important: Use a timeout to ensure the previous speech was cancelled properly
    setTimeout(() => {
        window.speechSynthesis.speak(utterance);
    }, 50);
};

/**
 * Calculate distance between two points in meters (Haversine formula)
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

/**
 * Calculate the distance from a point to a line segment
 * Used to detect if the user is off-route
 */
export const getDistanceToSegment = (p, v, w) => {
    const l2 = Math.pow(v.lng - w.lng, 2) + Math.pow(v.lat - w.lat, 2);
    if (l2 === 0) return calculateDistance(p.lat, p.lng, v.lat, v.lng);
    
    let t = ((p.lng - v.lng) * (w.lng - v.lng) + (p.lat - v.lat) * (w.lat - v.lat)) / l2;
    t = Math.max(0, Math.min(1, t));
    
    const projection = {
        lat: v.lat + t * (w.lat - v.lat),
        lng: v.lng + t * (w.lng - v.lng)
    };
    
    return calculateDistance(p.lat, p.lng, projection.lat, projection.lng);
};

/**
 * Detect if a point is off the route polyline
 * @param {Object} pos {lat, lng}
 * @param {Array} polyline Array of [lng, lat]
 * @param {number} threshold Distance in meters
 */
export const isOffRoute = (pos, polyline, threshold = 100) => {
    if (!polyline || polyline.length < 2) return false;
    
    let minDist = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
        const v = { lng: polyline[i][0], lat: polyline[i][1] };
        const w = { lng: polyline[i+1][0], lat: polyline[i+1][1] };
        const dist = getDistanceToSegment(pos, v, w);
        if (dist < minDist) minDist = dist;
    }
    
    return minDist > threshold;
};
