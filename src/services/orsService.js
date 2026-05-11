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
 * Fallback: Simple Nearest Neighbor algorithm for large datasets
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
            const dist = Math.sqrt(
                Math.pow(unvisited[i].latitude - currentPos.lat, 2) +
                Math.pow(unvisited[i].longitude - currentPos.lng, 2)
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
