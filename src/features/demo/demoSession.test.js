import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = { verifyOtp: vi.fn(), getSession: vi.fn() };
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));
const { startDemoSession, switchDemoAccount } = await import('./demoSession');
const { default: useTripStore } = await import('../../store/useTripStore');

const respond = (status, body) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('demo sessions', () => {
    beforeEach(() => {
        auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
        auth.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    });

    it('starts a sandbox and signs in with the one-time token, dropping any open trip', async () => {
        useTripStore.getState().loadTrip({ id: 'real-trip', title: 'Mine' }, []);
        globalThis.fetch = respond(200, { email: 'demo@example.com', tokenHash: 'h1', expiresAt: 'x' });
        await startDemoSession();
        expect(fetch).toHaveBeenCalledWith('/api/demo/start', { method: 'POST', headers: {} });
        expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'h1', type: 'email' });
        expect(useTripStore.getState().currentTrip).toBeNull();
    });

    it("shows the server's reason when the demo can't start", async () => {
        globalThis.fetch = respond(503, { error: 'The demo is busy right now.' });
        await expect(startDemoSession()).rejects.toThrow('The demo is busy right now.');
        expect(auth.verifyOtp).not.toHaveBeenCalled();
    });

    it('switches account with the current access token', async () => {
        globalThis.fetch = respond(200, { email: 'a@example.com', role: 'agent', tokenHash: 'h2' });
        expect(await switchDemoAccount()).toBe('agent');
        expect(fetch).toHaveBeenCalledWith('/api/demo/switch', { method: 'POST', headers: { Authorization: 'Bearer tok' } });
        expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'h2', type: 'email' });
    });
});
