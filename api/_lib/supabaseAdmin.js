import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client with the service-role key: bypasses row-level security,
 * so it only ever runs on the server (never VITE_-prefixed). Null when the
 * key isn't configured, so endpoints can say so instead of crashing.
 */
export const getAdminClient = () => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};
