import axios from 'axios';

const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY;
const BASE_URL = 'https://api.openrouteservice.org';

const orsApi = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json'
    }
});

/**
 * Proper Haversine distance calculation in meters
 */
const calculateHaversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
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
 * Fallback: Simple Nearest Neighbor algorithm using Haversine
 * @param {Object} start {lat, lng}
 * @param {Array} sites 
 * @returns {Array} Ordered sites
 */
export const getNearestNeighborRoute = (start, sites) => {
    let unvisited = [...sites];
    let ordered = [];
    let currentPos = start;

    while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;

        for (let i = 0; i < unvisited.length; i++) {
            const dist = calculateHaversine(
                currentPos.lat, currentPos.lng,
                unvisited[i].latitude, unvisited[i].longitude
            );
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = i;
            }
        }

        const nextSite = unvisited.splice(nearestIdx, 1)[0];
        ordered.push(nextSite);
        currentPos = { lat: nextSite.latitude, lng: nextSite.longitude };
    }

    return ordered;
};

/**
 * Get optimized order for sites starting from current position
 * @param {Object} start {lat, lng}
 * @param {Array} sites Array of {id, latitude, longitude}
 * @returns {Promise<Array>} Ordered list of site objects
 */
export const getOptimizedRoute = async (start, sites) => {
    if (!start || sites.length === 0) return [];

    // ORS Limit is 70 for optimization. If more, use fallback.
    if (sites.length > 70) {
        console.warn(`Large dataset (${sites.length} sites). Using local nearest-neighbor fallback.`);
        return getNearestNeighborRoute(start, sites);
    }

    const jobs = sites.map((site, index) => ({
        id: index,
        location: [site.longitude, site.latitude]
    }));

    const body = {
        jobs: jobs,
        vehicles: [
            {
                id: 1,
                profile: 'driving-car',
                start: [start.lng, start.lat]
            }
        ]
    };

    try {
        const response = await orsApi.post('/optimization', body);
        const route = response.data.routes[0];
        
        // Map the result back to our site objects based on the job index
        const orderedSiteIndices = route.steps
            .filter(step => step.type === 'job')
            .map(step => step.id);
            
        return orderedSiteIndices.map(idx => sites[idx]);
    } catch (error) {
        console.error('ORS Optimization Error:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Get route directions with full step-by-step instructions
 * @param {Array} coordinates Array of [lng, lat]
 * @returns {Promise<Object>} Directions object with geometry and steps
 */
export const getDirections = async (coordinates) => {
    const body = {
        coordinates: coordinates,
        instructions: true,
        units: 'm',
        preference: 'recommended',
        radiuses: coordinates.map(() => -1) // -1 means no limit: find the nearest road regardless of distance
    };

    try {
        const response = await orsApi.post('/v2/directions/driving-car/geojson', body);
        return response.data; // This returns a GeoJSON FeatureCollection
    } catch (error) {
        console.error('ORS Directions Error:', error.response?.data || error.message);
        throw error;
    }
};
