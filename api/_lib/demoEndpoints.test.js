import { describe, it, expect, vi, afterEach } from 'vitest';

const startDemo = vi.fn();
vi.mock('./demo.js', async (original) => ({ ...(await original()), startDemo: (...a) => startDemo(...a), cleanupExpiredDemos: async () => 2 }));
let adminClient = {};
vi.mock('./supabaseAdmin.js', () => ({ getAdminClient: () => adminClient }));
const pingDatabase = vi.fn();
vi.mock('./keepalive.js', () => ({ pingDatabase: (...a) => pingDatabase(...a) }));

const { POST: start } = await import('../demo/start.js');
const { GET: daily } = await import('../cron/daily.js');

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

describe('GET /api/cron/daily', () => {
    const cron = (auth) => daily(new Request('http://x/api/cron/daily', { headers: auth ? { authorization: auth } : {} }));

    it('only runs for the cron secret', async () => {
        vi.stubEnv('CRON_SECRET', 's3cret');
        expect((await cron()).status).toBe(401);
        expect((await cron('Bearer wrong')).status).toBe(401);
        expect(pingDatabase).not.toHaveBeenCalled();
    });

    it('pings the database and cleans up demos', async () => {
        vi.stubEnv('CRON_SECRET', 's3cret');
        pingDatabase.mockResolvedValue('2026-10-18T03:00:00Z');
        const res = await cron('Bearer s3cret');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ keepalive: '2026-10-18T03:00:00Z', demosRemoved: 2 });
        expect(pingDatabase).toHaveBeenCalledWith('vercel-cron');
    });

    it('still cleans up when the ping fails, and reports the failure', async () => {
        vi.stubEnv('CRON_SECRET', 's3cret');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        pingDatabase.mockRejectedValue(new Error('keepalive() answered HTTP 404'));
        const res = await cron('Bearer s3cret');
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ keepaliveError: 'keepalive() answered HTTP 404', demosRemoved: 2 });
    });

    it('keeps the project alive even without the service-role key', async () => {
        vi.stubEnv('CRON_SECRET', 's3cret');
        pingDatabase.mockResolvedValue('t');
        adminClient = null;
        const res = await cron('Bearer s3cret');
        expect(res.status).toBe(200);
        expect((await res.json()).demoCleanup).toMatch(/skipped/);
    });
});
