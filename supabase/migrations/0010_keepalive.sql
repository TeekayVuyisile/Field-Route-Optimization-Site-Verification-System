-- 0010: keep the free-tier project from pausing
--
-- Supabase pauses free projects after about a week without database
-- activity. GET /rest/v1/ (what the old ping called) is answered from the
-- API's cached schema and may never touch the database, so this function
-- does a real write. Called daily by Vercel Cron (api/cron/daily) and every
-- other day by GitHub Actions as a backup. The row also shows the last ping.
--
-- Idempotent: safe to run again in the SQL editor.

CREATE TABLE IF NOT EXISTS keepalive (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    pinged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    pinged_by TEXT
);
-- No policies: only the function below touches it
ALTER TABLE keepalive ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.keepalive(p_source TEXT DEFAULT 'unknown')
RETURNS TIMESTAMP WITH TIME ZONE LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    INSERT INTO keepalive (id, pinged_at, pinged_by) VALUES (1, NOW(), left(p_source, 40))
    ON CONFLICT (id) DO UPDATE SET pinged_at = EXCLUDED.pinged_at, pinged_by = EXCLUDED.pinged_by
    RETURNING pinged_at;
$$;

-- Callable with the public anon key (it only moves one timestamp)
REVOKE ALL ON FUNCTION public.keepalive(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keepalive(TEXT) TO anon, authenticated, service_role;
