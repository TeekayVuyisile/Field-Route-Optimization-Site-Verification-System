// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rateLimit.js';

describe('createRateLimiter', () => {
    it('allows up to the limit, then blocks with a retry hint', () => {
        let t = 0;
        const check = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => t });
        expect(check('u1').allowed).toBe(true);
        expect(check('u1').allowed).toBe(true);
        t = 15_000;
        expect(check('u1')).toEqual({ allowed: false, retryAfterSeconds: 45 });
    });

    it('frees up as old requests leave the window', () => {
        let t = 0;
        const check = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
        check('u1');
        t = 1000;
        expect(check('u1').allowed).toBe(true);
    });

    it('limits each user separately', () => {
        const check = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
        check('u1');
        expect(check('u2').allowed).toBe(true);
    });
});
