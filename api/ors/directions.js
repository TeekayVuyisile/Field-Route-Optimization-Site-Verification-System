import { handleOrsRequest } from '../_lib/orsProxy.js';
import { validateDirectionsBody } from '../_lib/validate.js';

/**
 * POST /api/ors/directions
 * Body: { coordinates: [[lng, lat], ...] }   (2-50 waypoints)
 * Returns: the ORS driving-car GeoJSON FeatureCollection, with steps.
 */
export const POST = (request) => handleOrsRequest(request, {
    path: '/openrouteservice/v2/directions/driving-car/geojson',
    validate: validateDirectionsBody,
    buildOrsBody: ({ coordinates }) => ({
        coordinates,
        instructions: true,
        units: 'm',
        preference: 'recommended',
        // -1: snap to the nearest road however far away (rural sites)
        radiuses: coordinates.map(() => -1)
    })
});
