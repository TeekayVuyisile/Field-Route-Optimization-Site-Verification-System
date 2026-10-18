// Sliding-window rate limiter kept in function memory.
// Best-effort only: each warm serverless instance has its own counters, so
// this stops a runaway client loop, not a determined abuser. A shared store
// (e.g. Upstash Redis) would be needed for a hard global limit.

export const createRateLimiter = ({ limit, windowMs, now = () => Date.now() }) => {
    const hits = new Map(); // key -> timestamps within the window

    return (key) => {
        const t = now();
        const recent = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
        if (recent.length >= limit) {
            hits.set(key, recent);
            const retryAfterMs = windowMs - (t - recent[0]);
            return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
        }
        recent.push(t);
        hits.set(key, recent);
        return { allowed: true };
    };
};
