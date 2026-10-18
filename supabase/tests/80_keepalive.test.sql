-- Keep-alive ping (migration 0010)

SET ROLE anon;
DO $$
DECLARE v_first TIMESTAMP WITH TIME ZONE;
BEGIN
    v_first := public.keepalive('github');
    IF v_first IS NULL THEN RAISE EXCEPTION 'FAIL: keepalive returned nothing'; END IF;
    PERFORM public.keepalive('vercel-cron');
    RAISE NOTICE 'PASS: the public anon key can ping';
END $$;

DO $$
BEGIN
    BEGIN
        PERFORM 1 FROM keepalive;
        RAISE EXCEPTION 'FAIL: anon can read the keepalive table directly';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: the table itself is closed';
END $$;
RESET ROLE;

DO $$
BEGIN
    IF (SELECT count(*) FROM keepalive) <> 1 THEN RAISE EXCEPTION 'FAIL: pings should update one row'; END IF;
    IF (SELECT pinged_by FROM keepalive) <> 'vercel-cron' THEN RAISE EXCEPTION 'FAIL: the last ping''s source was not recorded'; END IF;
    RAISE NOTICE 'PASS: one row records the latest ping';
END $$;
