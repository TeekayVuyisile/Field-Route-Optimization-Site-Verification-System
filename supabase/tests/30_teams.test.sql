-- Teams (migration 0005): provisioning, invitations, assignment, role-based RLS
--
-- Cast:  M = manager of team 1      A = agent invited into team 1
--        X = user in another team   L = existing user who later accepts an invite

-- ---- Provisioning --------------------------------------------------------

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('10000000-0000-0000-0000-00000000000a', 'M@Example.com', NOW()),
    ('20000000-0000-0000-0000-00000000000a', 'x@example.com', NOW());

DO $$
DECLARE m org_members;
BEGIN
    SELECT * INTO m FROM org_members WHERE user_id = '10000000-0000-0000-0000-00000000000a';
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: confirmed sign-up got no team'; END IF;
    IF m.role <> 'manager' THEN RAISE EXCEPTION 'FAIL: personal team owner should be manager'; END IF;
    IF m.email <> 'm@example.com' THEN RAISE EXCEPTION 'FAIL: member email should be lower-cased'; END IF;
    IF (SELECT name FROM organizations WHERE id = m.org_id) <> 'm''s team' THEN RAISE EXCEPTION 'FAIL: team name'; END IF;
    RAISE NOTICE 'PASS: confirmed sign-up gets a personal team as manager';
END $$;

-- Unconfirmed sign-up: nothing until the email is confirmed
INSERT INTO auth.users (id, email) VALUES ('30000000-0000-0000-0000-00000000000a', 'slow@example.com');
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM org_members WHERE user_id = '30000000-0000-0000-0000-00000000000a') THEN
        RAISE EXCEPTION 'FAIL: unconfirmed user was given a team';
    END IF;
END $$;
UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = '30000000-0000-0000-0000-00000000000a';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM org_members WHERE user_id = '30000000-0000-0000-0000-00000000000a') THEN
        RAISE EXCEPTION 'FAIL: confirming the email did not create a team';
    END IF;
    RAISE NOTICE 'PASS: team is created only once the email is confirmed';
END $$;

-- ---- Invitations ---------------------------------------------------------

SET ROLE authenticated;
SELECT public.test_act_as('10000000-0000-0000-0000-00000000000a');
INSERT INTO org_invitations (org_id, email, role, invited_by)
VALUES (public.current_org_id(), 'a@example.com', 'agent', '10000000-0000-0000-0000-00000000000a');

SELECT public.test_act_as('20000000-0000-0000-0000-00000000000a');
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM org_invitations) THEN RAISE EXCEPTION 'FAIL: outsider can read another team''s invitations'; END IF;
    BEGIN
        INSERT INTO org_invitations (org_id, email, invited_by)
        VALUES ((SELECT org_id FROM org_members WHERE user_id = '10000000-0000-0000-0000-00000000000a'),
                'evil@example.com', '20000000-0000-0000-0000-00000000000a');
        RAISE EXCEPTION 'FAIL: outsider invited someone into another team';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: only the team''s managers see and create its invitations';
END $$;
RESET ROLE;

-- Invited agent signs up and confirms -> joins team 1 as agent
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('10000000-0000-0000-0000-00000000000b', 'A@example.com', NOW());
DO $$
DECLARE a org_members;
BEGIN
    SELECT * INTO a FROM org_members WHERE user_id = '10000000-0000-0000-0000-00000000000b';
    IF a.org_id IS DISTINCT FROM (SELECT org_id FROM org_members WHERE user_id = '10000000-0000-0000-0000-00000000000a') THEN
        RAISE EXCEPTION 'FAIL: invited user did not join the inviting team';
    END IF;
    IF a.role <> 'agent' THEN RAISE EXCEPTION 'FAIL: invited role not applied'; END IF;
    IF (SELECT accepted_at FROM org_invitations WHERE email = 'a@example.com') IS NULL THEN
        RAISE EXCEPTION 'FAIL: invitation not marked accepted';
    END IF;
    IF (SELECT count(*) FROM organizations) <> 3 THEN RAISE EXCEPTION 'FAIL: invited user should not get a personal team'; END IF;
    RAISE NOTICE 'PASS: invited email joins the inviting team with the invited role';
END $$;

-- ---- Trips, assignment and visibility -------------------------------------

SET ROLE authenticated;
SELECT public.test_act_as('10000000-0000-0000-0000-00000000000a');
SELECT public.create_trip_with_sites('Assigned run', '[{"name":"S1","latitude":-26,"longitude":28}]'::jsonb);
SELECT public.create_trip_with_sites('Manager only', '[{"name":"S2","latitude":-26,"longitude":28}]'::jsonb);
UPDATE trips SET assigned_to = '10000000-0000-0000-0000-00000000000b', status = 'assigned' WHERE title = 'Assigned run';

DO $$
BEGIN
    BEGIN
        UPDATE trips SET assigned_to = '20000000-0000-0000-0000-00000000000a' WHERE title = 'Manager only';
        RAISE EXCEPTION 'FAIL: assigned a trip to someone outside the team';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE trips SET org_id = (SELECT org_id FROM org_members WHERE user_id = '20000000-0000-0000-0000-00000000000a')
        WHERE title = 'Manager only';
        RAISE EXCEPTION 'FAIL: moved a trip to another team';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: managers assign within the team only, trips never change team';
END $$;

-- Agent's view
SELECT public.test_act_as('10000000-0000-0000-0000-00000000000b');
DO $$
BEGIN
    IF (SELECT array_agg(title) FROM trips) IS DISTINCT FROM ARRAY['Assigned run'] THEN
        RAISE EXCEPTION 'FAIL: agent should see exactly the trip assigned to them';
    END IF;
    UPDATE sites SET is_checked = true, notes = 'done' WHERE name = 'S1';
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: agent could not check a site on their assigned trip'; END IF;
    UPDATE trips SET status = 'in_progress' WHERE title = 'Assigned run';
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: agent could not start their assigned trip'; END IF;
    BEGIN
        UPDATE trips SET assigned_to = NULL WHERE title = 'Assigned run';
        RAISE EXCEPTION 'FAIL: agent unassigned a manager''s trip';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: agent sees and works only their assigned trip';
END $$;

-- Agent's own trip: may self-assign, may not hand it to the manager
SELECT public.create_trip_with_sites('Agent own', '[{"name":"S3","latitude":-26,"longitude":28}]'::jsonb);
DO $$
BEGIN
    UPDATE trips SET assigned_to = '10000000-0000-0000-0000-00000000000b' WHERE title = 'Agent own';
    BEGIN
        UPDATE trips SET assigned_to = '10000000-0000-0000-0000-00000000000a' WHERE title = 'Agent own';
        RAISE EXCEPTION 'FAIL: agent assigned a trip to someone else';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: agents can only assign their own trips to themselves';
END $$;

-- Status timestamps
DO $$
DECLARE t trips;
BEGIN
    SELECT * INTO t FROM trips WHERE title = 'Assigned run';
    IF t.started_at IS NULL THEN RAISE EXCEPTION 'FAIL: started_at not set on in_progress'; END IF;
    UPDATE trips SET status = 'completed' WHERE title = 'Assigned run' RETURNING * INTO t;
    IF t.completed_at IS NULL THEN RAISE EXCEPTION 'FAIL: completed_at not set'; END IF;
    UPDATE trips SET status = 'in_progress' WHERE title = 'Assigned run' RETURNING * INTO t;
    IF t.completed_at IS NOT NULL THEN RAISE EXCEPTION 'FAIL: completed_at not cleared on reopen'; END IF;
    RAISE NOTICE 'PASS: status changes stamp started_at / completed_at';
END $$;

-- Manager's view: whole team, including the agent's own trip
SELECT public.test_act_as('10000000-0000-0000-0000-00000000000a');
DO $$
BEGIN
    IF (SELECT count(*) FROM trips) <> 3 THEN RAISE EXCEPTION 'FAIL: manager should see all 3 team trips'; END IF;
    IF NOT (SELECT is_checked FROM sites WHERE name = 'S1') THEN RAISE EXCEPTION 'FAIL: manager can''t see agent''s progress'; END IF;
    RAISE NOTICE 'PASS: manager sees every trip and site in the team';
END $$;

-- Outsider sees nothing of team 1
SELECT public.test_act_as('20000000-0000-0000-0000-00000000000a');
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM trips) OR EXISTS (SELECT 1 FROM sites) THEN RAISE EXCEPTION 'FAIL: outsider sees team 1 trips'; END IF;
    IF (SELECT count(*) FROM org_members) <> 1 OR (SELECT count(*) FROM organizations) <> 1 THEN
        RAISE EXCEPTION 'FAIL: outsider sees other teams or members';
    END IF;
    RAISE NOTICE 'PASS: other teams are invisible';
END $$;

-- ---- Team photos ---------------------------------------------------------

RESET ROLE;
INSERT INTO storage.objects (bucket_id, name)
VALUES ('site-photos', '10000000-0000-0000-0000-00000000000b/s1/p.jpg');
INSERT INTO site_images (site_id, user_id, storage_path, file_name)
VALUES ((SELECT id FROM sites WHERE name = 'S1'), '10000000-0000-0000-0000-00000000000b',
        '10000000-0000-0000-0000-00000000000b/s1/p.jpg', 'p.jpg');
SET ROLE authenticated;

SELECT public.test_act_as('10000000-0000-0000-0000-00000000000a');
DO $$
BEGIN
    IF (SELECT count(*) FROM storage.objects) <> 1 THEN RAISE EXCEPTION 'FAIL: manager can''t view agent''s photo file'; END IF;
    RAISE NOTICE 'PASS: manager can view photos agents took on team trips';
END $$;
SELECT public.test_act_as('20000000-0000-0000-0000-00000000000a');
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.objects) OR EXISTS (SELECT 1 FROM site_images) THEN
        RAISE EXCEPTION 'FAIL: outsider can view team 1 photos';
    END IF;
END $$;
-- Same order as TripReview.handleDeleteImage: the file first (its delete
-- policy finds the trip through the site_images row), then the row
SELECT public.test_act_as('10000000-0000-0000-0000-00000000000a');
DELETE FROM storage.objects WHERE name LIKE '%/p.jpg';
DELETE FROM site_images WHERE file_name = 'p.jpg';
RESET ROLE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM site_images WHERE file_name = 'p.jpg') OR EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%/p.jpg') THEN
        RAISE EXCEPTION 'FAIL: manager could not delete an agent''s photo';
    END IF;
    RAISE NOTICE 'PASS: manager can delete photos on team trips';
END $$;

-- ---- Team management -----------------------------------------------------

SET ROLE authenticated;
SELECT public.test_act_as('10000000-0000-0000-0000-00000000000b');
DO $$
BEGIN
    IF (SELECT count(*) FROM org_members) <> 2 THEN RAISE EXCEPTION 'FAIL: agent should see both teammates'; END IF;
    UPDATE org_members SET role = 'manager' WHERE user_id = '10000000-0000-0000-0000-00000000000b';
    IF FOUND THEN RAISE EXCEPTION 'FAIL: agent promoted themselves'; END IF;
    RAISE NOTICE 'PASS: agents see teammates but cannot change roles';
END $$;

SELECT public.test_act_as('10000000-0000-0000-0000-00000000000a');
DO $$
BEGIN
    DELETE FROM org_members WHERE user_id = '10000000-0000-0000-0000-00000000000a';
    IF FOUND THEN RAISE EXCEPTION 'FAIL: manager removed themselves (team could lose its last manager)'; END IF;
    UPDATE org_members SET role = 'manager' WHERE user_id = '10000000-0000-0000-0000-00000000000b';
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: manager could not promote a teammate'; END IF;
    RAISE NOTICE 'PASS: managers change teammates'' roles but not their own membership';
END $$;

-- ---- Existing user accepting an invitation --------------------------------

RESET ROLE;
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('40000000-0000-0000-0000-00000000000a', 'late@example.com', NOW());
INSERT INTO org_invitations (org_id, email, invited_by)
VALUES ((SELECT org_id FROM org_members WHERE user_id = '10000000-0000-0000-0000-00000000000a'),
        'late@example.com', '10000000-0000-0000-0000-00000000000a');
SET ROLE authenticated;
SELECT public.test_act_as('40000000-0000-0000-0000-00000000000a');
DO $$
DECLARE inv RECORD; old_org UUID := public.current_org_id();
BEGIN
    SELECT * INTO inv FROM public.my_pending_invitation();
    IF inv.org_name <> 'm''s team' THEN RAISE EXCEPTION 'FAIL: pending invitation not reported'; END IF;
    PERFORM public.accept_pending_invitation();
    IF public.current_org_id() IS DISTINCT FROM inv.org_id THEN RAISE EXCEPTION 'FAIL: did not move to inviting team'; END IF;
    IF EXISTS (SELECT 1 FROM public.my_pending_invitation()) THEN RAISE EXCEPTION 'FAIL: invitation still pending'; END IF;
    RAISE NOTICE 'PASS: existing user with an empty team can accept an invitation';
END $$;

-- ...but not if leaving would orphan trips
SELECT public.test_act_as('20000000-0000-0000-0000-00000000000a');
SELECT public.create_trip_with_sites('X trip', '[{"name":"SX","latitude":-26,"longitude":28}]'::jsonb);
RESET ROLE;
INSERT INTO org_invitations (org_id, email, invited_by)
VALUES ((SELECT org_id FROM org_members WHERE user_id = '10000000-0000-0000-0000-00000000000a'),
        'x@example.com', '10000000-0000-0000-0000-00000000000a');
SET ROLE authenticated;
SELECT public.test_act_as('20000000-0000-0000-0000-00000000000a');
DO $$
BEGIN
    BEGIN
        PERFORM public.accept_pending_invitation();
        RAISE EXCEPTION 'FAIL: left a team that still has trips';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'PASS: accepting is refused when it would orphan trips';
END $$;

-- ensure_my_membership is a no-op for members, and anon can't call RPCs
DO $$
BEGIN
    IF public.ensure_my_membership() IS DISTINCT FROM public.current_org_id() THEN
        RAISE EXCEPTION 'FAIL: ensure_my_membership changed an existing membership';
    END IF;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
    BEGIN
        PERFORM public.ensure_my_membership();
        RAISE EXCEPTION 'FAIL: anon could call ensure_my_membership';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: membership RPCs are idempotent and closed to anon';
END $$;
