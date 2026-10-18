// Keeps the free-tier Supabase project from pausing: one real database write
// through the public keepalive() function (migration 0010). Uses the anon
// key, so it works even without the service-role key.

/** @returns {Promise<string>} the recorded ping time */
export const pingDatabase = async (source) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not set');

    const response = await fetch(`${url.trim().replace(/\/+$/, '')}/rest/v1/rpc/keepalive`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_source: source }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`keepalive() answered HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.json();
};
