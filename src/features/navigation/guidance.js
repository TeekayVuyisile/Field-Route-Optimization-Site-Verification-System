import { calculateDistance } from '../../lib/geo';

export const SITE_ALERT_M = 100;
export const OFF_ROUTE_M = 150;
export const HEADS_UP_M = 150;
// Below this the "arrive" instruction takes over from the heads-up
export const HEADS_UP_MIN_M = 40;
export const ARRIVE_M = 30;

/**
 * Pure turn-by-turn decision for one GPS fix. Returns what should happen;
 * the caller does the speaking and state updates.
 *
 * `lastHeadsUpIdx` / `lastArrivedIdx` guard against successive fixes inside
 * the same radius repeating speech or advancing more than one step.
 *
 * @param {Object} p
 * @param {{lat:number,lng:number}} p.pos
 * @param {Object|null} p.nextSite  next unvisited site
 * @param {string|null} p.lastAnnouncedId  site already announced
 * @param {Array} p.steps  ORS steps (flattened across segments)
 * @param {number} p.stepIdx  current step index
 * @param {Array|null} p.coords  route polyline, [lng, lat] pairs
 * @param {number} p.lastHeadsUpIdx
 * @param {number} p.lastArrivedIdx
 * @returns {{ approachingSite: Object|null, headsUp: Object|null, arrive: Object|null }}
 */
export const evaluateGuidance = ({
    pos, nextSite, lastAnnouncedId, steps, stepIdx, coords, lastHeadsUpIdx, lastArrivedIdx
}) => {
    const result = { approachingSite: null, headsUp: null, arrive: null };

    if (nextSite && nextSite.id !== lastAnnouncedId) {
        const dist = calculateDistance(pos.lat, pos.lng, nextSite.latitude, nextSite.longitude);
        if (dist < SITE_ALERT_M) result.approachingSite = nextSite;
    }

    if (!coords || steps.length === 0 || stepIdx >= steps.length - 1) return result;

    const target = stepIdx + 1;
    const nextStep = steps[target];
    const maneuver = coords[nextStep.way_points[0]];
    if (!maneuver) return result;

    const distToTurn = calculateDistance(pos.lat, pos.lng, maneuver[1], maneuver[0]);

    if (distToTurn < HEADS_UP_M && distToTurn > HEADS_UP_MIN_M && lastHeadsUpIdx !== target) {
        result.headsUp = { index: target, step: nextStep };
    }
    if (distToTurn < ARRIVE_M && lastArrivedIdx !== target) {
        result.arrive = { index: target, step: nextStep };
    }

    return result;
};

/**
 * The next stop is the first unchecked site in the current (optimized) order.
 * Deriving it, instead of storing it once at optimize time, means checking a
 * site immediately moves the target to the following stop.
 */
export const findNextSite = (sites) => sites.find((s) => !s.is_checked) ?? null;
