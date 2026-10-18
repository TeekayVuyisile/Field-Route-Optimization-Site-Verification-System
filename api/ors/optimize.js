import { handleOrsRequest } from '../_lib/orsProxy.js';
import { validateOptimizeBody } from '../_lib/validate.js';

/**
 * POST /api/ors/optimize
 * Body: { start: [lng, lat], jobs: [[lng, lat], ...] }   (max 70 jobs)
 * Returns: { order: number[] }  job indices in visiting order. Jobs ORS
 * couldn't route are appended at the end so no site is ever dropped.
 */
export const POST = (request) => handleOrsRequest(request, {
    path: '/vroom/v0',
    validate: validateOptimizeBody,
    buildOrsBody: ({ start, jobs }) => ({
        jobs: jobs.map((location, index) => ({ id: index, location })),
        vehicles: [{ id: 1, profile: 'driving-car', start }]
    }),
    shapeResponse: (data) => {
        const visited = (data.routes?.[0]?.steps ?? [])
            .filter((step) => step.type === 'job')
            .map((step) => step.id);
        const unassigned = (data.unassigned ?? []).map((job) => job.id);
        return { order: [...visited, ...unassigned] };
    }
});
