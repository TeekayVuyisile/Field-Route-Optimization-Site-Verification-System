import { describe, it, expect, vi, afterEach } from 'vitest';
import { pingDatabase } from './keepalive.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('pingDatabase', () => {
    it('calls keepalive() with the anon key, tolerating a stray trailing slash or space in the URL', async () => {
        vi.stubEnv('SUPABASE_URL', ' https://abc.supabase.co/ ');
        vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
        const fetchMock = vi.fn(async () => new Response('"2026-10-18T03:00:00+00:00"', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        expect(await pingDatabase('vercel-cron')).toBe('2026-10-18T03:00:00+00:00');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/keepalive');
        expect(init).toMatchObject({ method: 'POST', body: '{"p_source":"vercel-cron"}' });
        expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer anon' });
    });

    it('fails loudly (so the cron run shows red) when the database does not answer', async () => {
        vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co');
        vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Could not find the function"}', { status: 404 })));
        await expect(pingDatabase('x')).rejects.toThrow('HTTP 404');
    });
});
