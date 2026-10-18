// Verifies the caller's Supabase access token by asking Supabase Auth who it
// belongs to. Results are cached briefly so a burst of routing calls doesn't
// add an auth round trip each time.

const CACHE_MS = 60_000;
const cache = new Map(); // token -> { userId, expires }

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

/** Returns the user id for a valid bearer token, or null. */
export const getUserId = async (request) => {
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;

    const cached = cache.get(token);
    if (cached && cached.expires > Date.now()) return cached.userId;

    const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey() },
        signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;

    const user = await response.json();
    if (!user?.id) return null;

    cache.set(token, { userId: user.id, expires: Date.now() + CACHE_MS });
    return user.id;
};

export const clearAuthCache = () => cache.clear();
