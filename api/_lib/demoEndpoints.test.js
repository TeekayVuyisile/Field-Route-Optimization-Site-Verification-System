import { describe, it, expect, vi, afterEach } from 'vitest';

const startDemo = vi.fn();
vi.mock('./demo.js', async (original) => ({ ...(await original()), startDemo: (...a) => startDemo(...a), cleanupExpiredDemos: async () => 2 }));
let adminClient = {};
vi.mock('./supabaseAdmin.js', () => ({ getAdminClient: () => adminClient }));

const { POST: start } = await import('../demo/start.js');
const { GET: cleanup } = await import('../demo/cleanup.js');

const post = (ip) => new Request('http://x/api/demo/start', { method: 'POST', headers: { 'x-forwarded-for': ip } });

afterEach(() => { vi.unstubAllEnvs(); adminClient = {}; });

describe('POST /api/demo/start', () => {
    it("says when the server isn't configured", async () => {
        adminClient = null;
        expect((await start(post('1.1.1.1'))).status).toBe(503);
    });

    it('starts a sandbox, limited to 3 per visitor per hour', async () => {
        startDemo.mockResolvedValue({ email: 'demo@example.com', tokenHash: 'h', expiresAt: 'x' });
        for (let i = 0; i < 3; i += 1) expect((await start(post('2.2.2.2'))).status).toBe(200);
        const limited = await start(post('2.2.2.2'));
        expect(limited.status).toBe(429);
        expect(limited.headers.get('Retry-After')).toBeTruthy();
        expect((await start(post('3.3.3.3'))).status).toBe(200);
    });
});

describe('GET /api/demo/cleanup', () => {
    it('only runs for the cron secret', async () => {
        vi.stubEnv('CRON_SECRET', 's3cret');
        expect((await cleanup(new Request('http://x/api/demo/cleanup'))).status).toBe(401);
        const ok = await cleanup(new Request('http://x/api/demo/cleanup', { headers: { authorization: 'Bearer s3cret' } }));
        expect(ok.status).toBe(200);
        expect(await ok.json()).toEqual({ removed: 2 });
    });
});
