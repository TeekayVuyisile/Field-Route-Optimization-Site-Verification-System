// ORS directions accept at most 50 waypoints per request. Longer routes are
// split into overlapping chunks (each chunk starts where the previous one
// ended), requested separately, then stitched back into one route.

export const MAX_WAYPOINTS_PER_REQUEST = 50;

/**
 * [[a,b,c,d,e]] with max 3 -> [[a,b,c],[c,d,e]]
 * Every chunk has at least 2 points, and consecutive chunks share one point.
 */
export const chunkWaypoints = (coords, max = MAX_WAYPOINTS_PER_REQUEST) => {
    if (max < 2) throw new Error('max must be at least 2');
    if (coords.length <= max) return [coords];

    const chunks = [];
    for (let start = 0; start < coords.length - 1; start += max - 1) {
        chunks.push(coords.slice(start, start + max));
    }
    return chunks;
};

/**
 * Merges ORS GeoJSON directions responses for consecutive chunks into one
 * FeatureCollection shaped like a single response. All index-based fields
 * (step.way_points, properties.way_points) are remapped into the merged
 * coordinate array; the duplicated junction point is kept only once.
 */
export const mergeDirections = (results) => {
    if (results.length === 1) return results[0];

    const coordinates = [];
    const segments = [];
    const wayPoints = [];
    let distance = 0;
    let duration = 0;

    results.forEach((result, i) => {
        const feature = result.features[0];
        const chunkCoords = feature.geometry.coordinates;
        // Index k of this chunk lands at base + k in the merged array. For
        // every chunk after the first, index 0 IS the previous chunk's last point.
        const base = i === 0 ? 0 : coordinates.length - 1;
        const remap = (k) => base + k;

        coordinates.push(...(i === 0 ? chunkCoords : chunkCoords.slice(1)));

        for (const segment of feature.properties.segments) {
            segments.push({
                ...segment,
                steps: segment.steps.map((step) => ({ ...step, way_points: step.way_points.map(remap) }))
            });
        }

        const chunkWayPoints = feature.properties.way_points.map(remap);
        wayPoints.push(...(i === 0 ? chunkWayPoints : chunkWayPoints.slice(1)));

        distance += feature.properties.summary?.distance ?? 0;
        duration += feature.properties.summary?.duration ?? 0;
    });

    const first = results[0].features[0];
    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates },
            properties: {
                ...first.properties,
                segments,
                way_points: wayPoints,
                summary: { distance, duration }
            }
        }]
    };
};
