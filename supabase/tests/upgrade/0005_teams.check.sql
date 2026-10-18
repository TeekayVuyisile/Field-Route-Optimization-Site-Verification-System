-- Runs after 0005 (applied twice) on top of 0005_teams.seed.sql

DO $$
BEGIN
    IF (SELECT count(*) FROM trips) <> 4 OR (SELECT count(*) FROM sites) <> 5 THEN
        RAISE EXCEPTION 'FAIL: upgrade changed the number of trips or sites';
    END IF;
    IF EXISTS (SELECT 1 FROM trips WHERE org_id IS NULL) THEN RAISE EXCEPTION 'FAIL: trip left without a team'; END IF;
    IF EXISTS (
        SELECT 1 FROM trips t JOIN org_members m ON m.user_id = t.user_id WHERE t.org_id <> m.org_id
    ) THEN
        RAISE EXCEPTION 'FAIL: trip not in its owner''s team';
    END IF;
    RAISE NOTICE 'PASS: every existing trip moved into its owner''s team, nothing lost';
END $$;

DO $$
BEGIN
    IF (SELECT count(*) FROM org_members WHERE role = 'manager') <> 3 THEN
        RAISE EXCEPTION 'FAIL: expected 3 personal teams (confirmed users + users with trips)';
    END IF;
    IF EXISTS (SELECT 1 FROM org_members WHERE user_id = 'dddddddd-0000-0000-0000-000000000004') THEN
        RAISE EXCEPTION 'FAIL: unconfirmed user without trips got a team';
    END IF;
    IF (SELECT count(DISTINCT org_id) FROM org_members) <> 3 THEN RAISE EXCEPTION 'FAIL: users share a team after backfill'; END IF;
    RAISE NOTICE 'PASS: each existing user got their own team, managed by them';
END $$;

DO $$
BEGIN
    IF (SELECT status FROM trips WHERE title = 'Untouched') <> 'draft' THEN RAISE EXCEPTION 'FAIL: untouched trip status'; END IF;
    IF (SELECT status FROM trips WHERE title = 'Half done') <> 'in_progress' THEN RAISE EXCEPTION 'FAIL: half-done trip status'; END IF;
    IF (SELECT status FROM trips WHERE title = 'All done') <> 'completed' THEN RAISE EXCEPTION 'FAIL: finished trip status'; END IF;
    IF (SELECT completed_at FROM trips WHERE title = 'All done') IS NULL THEN RAISE EXCEPTION 'FAIL: completed_at missing'; END IF;
    RAISE NOTICE 'PASS: status derived from checked sites';
END $$;

-- The owner still sees and edits exactly their trips through the new policies
SET ROLE authenticated;
SELECT public.test_act_as('aaaaaaaa-0000-0000-0000-000000000001');
DO $$
BEGIN
    IF (SELECT count(*) FROM trips) <> 3 THEN RAISE EXCEPTION 'FAIL: owner lost access to their trips'; END IF;
    UPDATE sites SET notes = 'still works' WHERE name = 'u1';
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: owner can no longer edit sites'; END IF;
    RAISE NOTICE 'PASS: existing users keep full access to their own trips';
END $$;
