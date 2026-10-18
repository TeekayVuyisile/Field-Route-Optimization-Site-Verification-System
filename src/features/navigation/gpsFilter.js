import { calculateDistance } from '../../lib/geo';

// Real GPS chips (phones in a vehicle) easily beat 100m, but WiFi/IP-based
// positioning (laptops, indoors, no GPS chip) commonly reports 150-300m and
// would otherwise never pass, silently freezing the position forever.
export const MAX_ACCURACY_M = 300;
// Larger jumps between consecutive fixes are hardware noise, not driving
export const MAX_JUMP_M = 500;
// Smaller moves are jitter while standing still
export const MIN_MOVE_M = 5;

/**
 * Decide whether a watchPosition fix should update the user's position.
 * `lastPos` is the last ACCEPTED position (a manual GPS refresh resets it).
 */
export const shouldAcceptFix = (lastPos, fix, accuracy) => {
    if (accuracy > MAX_ACCURACY_M) return false;
    if (!lastPos) return true;

    const jump = calculateDistance(lastPos.lat, lastPos.lng, fix.lat, fix.lng);
    return jump <= MAX_JUMP_M && jump >= MIN_MOVE_M;
};
