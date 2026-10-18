import { supabase } from '../../lib/supabase';
import useTripStore from '../../store/useTripStore';

const callDemoApi = async (path, accessToken) => {
    let response;
    try {
        response = await fetch(path, {
            method: 'POST',
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
    } catch {
        throw new Error("Couldn't reach the demo. Check your connection and try again.");
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The demo is unavailable right now.');
    return body;
};

// The server hands back a one-time sign-in token (no password, no email)
const signInWithToken = async ({ tokenHash }) => {
    // Never carry one account's open trip into another
    useTripStore.getState().clearStore();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (error) throw new Error("Couldn't sign in to the demo. Please try again.");
};

/** Creates a private sandbox and signs in as its manager */
export const startDemoSession = async () => {
    await signInWithToken(await callDemoApi('/api/demo/start'));
};

/** Signs in as the sandbox's other account (manager <-> agent); returns the new role */
export const switchDemoAccount = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const result = await callDemoApi('/api/demo/switch', session?.access_token);
    await signInWithToken(result);
    return result.role;
};
