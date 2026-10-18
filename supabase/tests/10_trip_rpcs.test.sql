-- create_trip_with_sites / set_site_order (migrations 0002, 0005)
-- Each *.test.sql runs in a fresh database with all migrations applied.
-- A check RAISEs 'FAIL: ...' on failure; the runner stops at the first error.

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', NOW()),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', NOW());

SET ROLE authenticated;
SELECT public.test_act_as('aaaaaaaa-0000-0000-0000-000000000001');

CREATE TEMP TABLE result AS
SELECT public.create_trip_with_sites('Audit', '[
  {"name":"A","latitude":-26.1,"longitude":28.1},
  {"name":"B","latitude":-26.2,"longitude":28.2,"notes":"gate"},
  {"name":"C","latitude":-26.3,"longitude":28.3}
]'::jsonb) AS r;

DO $$
DECLARE r JSONB := (SELECT r FROM result);
BEGIN
    IF r->'trip'->>'title' <> 'Audit' THEN RAISE EXCEPTION 'FAIL: trip title'; END IF;
    IF r->'trip'->>'user_id' <> 'aaaaaaaa-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'FAIL: user_id not auth.uid()'; END IF;
    IF (r->'trip'->>'org_id')::uuid IS DISTINCT FROM public.current_org_id() THEN RAISE EXCEPTION 'FAIL: trip not in caller''s org'; END IF;
    IF r->'trip'->>'status' <> 'draft' THEN RAISE EXCEPTION 'FAIL: new trip should be draft'; END IF;
    IF jsonb_array_length(r->'sites') <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 sites'; END IF;
    IF r->'sites'->0->>'name' <> 'A' OR (r->'sites'->0->>'order_index')::int <> 0 THEN RAISE EXCEPTION 'FAIL: first site/order'; END IF;
    IF r->'sites'->1->>'notes' <> 'gate' THEN RAISE EXCEPTION 'FAIL: notes'; END IF;
    IF r->'sites'->2->>'notes' <> '' THEN RAISE EXCEPTION 'FAIL: default notes'; END IF;
    RAISE NOTICE 'PASS: trip + sites created in the caller''s team with real ids and order';
END $$;

DO $$
DECLARE before INT := (SELECT count(*) FROM trips);
BEGIN
    BEGIN
        PERFORM public.create_trip_with_sites('Empty', '[]'::jsonb);
        RAISE EXCEPTION 'FAIL: empty trip accepted';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    END;
    IF (SELECT count(*) FROM trips) <> before THEN RAISE EXCEPTION 'FAIL: trip row left behind'; END IF;
    RAISE NOTICE 'PASS: empty site list rejected, nothing written';
END $$;

DO $$
DECLARE before INT := (SELECT count(*) FROM trips);
BEGIN
    BEGIN
        PERFORM public.create_trip_with_sites('Broken', '[{"name":"ok","latitude":-26,"longitude":28},{"latitude":-26,"longitude":28}]'::jsonb);
        RAISE EXCEPTION 'FAIL: bad site accepted';
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;
    IF (SELECT count(*) FROM trips) <> before THEN RAISE EXCEPTION 'FAIL: orphan trip after failed sites insert'; END IF;
    RAISE NOTICE 'PASS: failed sites insert leaves no orphan trip';
END $$;

DO $$
DECLARE ids UUID[];
BEGIN
    SELECT array_agg(id ORDER BY order_index DESC) INTO ids FROM sites;
    PERFORM public.set_site_order(ids);
    IF (SELECT string_agg(name, '' ORDER BY order_index) FROM sites) <> 'CBA' THEN RAISE EXCEPTION 'FAIL: order not applied'; END IF;
    RAISE NOTICE 'PASS: set_site_order applied C,B,A';
END $$;

-- User B is in a different team: can't see or reorder A's sites
SELECT public.test_act_as('bbbbbbbb-0000-0000-0000-000000000002');
DO $$
BEGIN
    IF (SELECT count(*) FROM trips) <> 0 OR (SELECT count(*) FROM sites) <> 0 THEN
        RAISE EXCEPTION 'FAIL: B sees A''s trip or sites';
    END IF;
END $$;
RESET ROLE;
CREATE TEMP TABLE a_ids AS SELECT array_agg(id ORDER BY order_index DESC) AS ids FROM sites;
GRANT SELECT ON a_ids TO authenticated;
SET ROLE authenticated;
SELECT public.set_site_order((SELECT ids FROM a_ids));
RESET ROLE;
DO $$
BEGIN
    IF (SELECT string_agg(name, '' ORDER BY order_index) FROM sites) <> 'CBA' THEN
        RAISE EXCEPTION 'FAIL: user B reordered user A''s sites';
    END IF;
    RAISE NOTICE 'PASS: other teams cannot read or reorder';
END $$;

SET ROLE anon;
DO $$
BEGIN
    BEGIN
        PERFORM public.set_site_order(ARRAY[]::uuid[]);
        RAISE EXCEPTION 'FAIL: anon could execute';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: anon has no EXECUTE';
END $$;
RESET ROLE;

SET ROLE authenticated;
SELECT public.test_act_as(NULL);
DO $$
BEGIN
    BEGIN
        PERFORM public.create_trip_with_sites('x', '[{"name":"a","latitude":-26,"longitude":28}]'::jsonb);
        RAISE EXCEPTION 'FAIL: no-uid call accepted';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'Not authenticated' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'PASS: unauthenticated call refused';
END $$;
