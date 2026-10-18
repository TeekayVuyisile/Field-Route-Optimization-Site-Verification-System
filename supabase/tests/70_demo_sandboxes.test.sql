-- Demo sandboxes (migration 0009)

-- Two fresh demo users (confirmed: the 0005 trigger gives each a team) and a
-- real user R who must never be affected
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('d1000000-0000-0000-0000-000000000001', 'demo-manager-1@example.com', NOW()),
    ('d2000000-0000-0000-0000-000000000002', 'demo-agent-1@example.com', NOW()),
    ('eeeeeeee-0000-0000-0000-000000000005', 'real@example.com', NOW());

-- Only the server (service role) may seed or list sandboxes
SET ROLE authenticated;
SELECT public.test_act_as('eeeeeeee-0000-0000-0000-000000000005');
DO $$
BEGIN
    BEGIN
        PERFORM public.seed_demo_team('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', NOW() + INTERVAL '1 day');
        RAISE EXCEPTION 'FAIL: a signed-in user could seed a demo team';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM * FROM public.expired_demo_teams();
        RAISE EXCEPTION 'FAIL: a signed-in user could list demo teams';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: seeding and cleanup are server-only';
END $$;
RESET ROLE;

-- The server's service-role key carries no user (auth.uid() is null)
SELECT public.test_act_as(NULL);
SET ROLE service_role;
SELECT public.seed_demo_team('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', NOW() + INTERVAL '1 day');
RESET ROLE;

DO $$
DECLARE v_org UUID := (SELECT org_id FROM org_members WHERE user_id = 'd1000000-0000-0000-0000-000000000001');
BEGIN
    IF (SELECT org_id FROM org_members WHERE user_id = 'd2000000-0000-0000-0000-000000000002') <> v_org
       OR (SELECT role FROM org_members WHERE user_id = 'd2000000-0000-0000-0000-000000000002') <> 'agent' THEN
        RAISE EXCEPTION 'FAIL: the agent did not join the demo team as an agent';
    END IF;
    IF (SELECT count(*) FROM organizations WHERE name = 'Demo team' AND demo_expires_at IS NOT NULL) <> 1 THEN
        RAISE EXCEPTION 'FAIL: expected exactly one demo team';
    END IF;
    IF (SELECT count(*) FROM organizations) <> 2 THEN
        RAISE EXCEPTION 'FAIL: the agent''s empty personal team was left behind';
    END IF;
    IF (SELECT count(*) FROM trips WHERE org_id = v_org) <> 3 OR (SELECT count(*) FROM checklist_templates WHERE org_id = v_org) <> 1 THEN
        RAISE EXCEPTION 'FAIL: the sandbox is missing trips or its checklist';
    END IF;
    IF (SELECT count(*) FROM sites WHERE check_flagged) <> 1 THEN
        RAISE EXCEPTION 'FAIL: expected one flagged check-in (computed by the 0006 trigger)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM trips WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '6 days') THEN
        RAISE EXCEPTION 'FAIL: the completed trip lost its dates';
    END IF;
    RAISE NOTICE 'PASS: a sandbox has a manager, an agent, 3 trips, a checklist and a flagged check-in';
END $$;

-- The demo agent sees their assigned trips only; the real user sees nothing of it
SET ROLE authenticated;
SELECT public.test_act_as('d2000000-0000-0000-0000-000000000002');
DO $$
BEGIN
    IF (SELECT count(*) FROM trips) <> 2 THEN RAISE EXCEPTION 'FAIL: the demo agent should see their 2 assigned trips'; END IF;
    RAISE NOTICE 'PASS: the demo agent sees their assigned trips';
END $$;

SELECT public.test_act_as('d1000000-0000-0000-0000-000000000001');
DO $$
BEGIN
    BEGIN
        INSERT INTO org_invitations (org_id, email, role, invited_by)
        VALUES ((SELECT org_id FROM org_members WHERE user_id = 'd1000000-0000-0000-0000-000000000001'), 'someone.real@company.co.za', 'agent',
                'd1000000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'FAIL: a demo team invited a real person';
    EXCEPTION WHEN insufficient_privilege THEN
        IF SQLERRM NOT LIKE 'Demo teams%' THEN RAISE EXCEPTION 'FAIL: refused for the wrong reason: %', SQLERRM; END IF;
    END;
    RAISE NOTICE 'PASS: demo teams cannot invite anyone';
END $$;

SELECT public.test_act_as('eeeeeeee-0000-0000-0000-000000000005');
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM trips) OR EXISTS (SELECT 1 FROM checklist_templates) THEN
        RAISE EXCEPTION 'FAIL: a real user can see demo data';
    END IF;
    INSERT INTO org_invitations (org_id, email, role, invited_by)
    VALUES ((SELECT org_id FROM org_members WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000005'), 'new.agent@company.co.za', 'agent',
            'eeeeeeee-0000-0000-0000-000000000005');
    RAISE NOTICE 'PASS: real teams are unaffected (and can still invite)';
END $$;
RESET ROLE;

-- Once expired, cleanup lists the team, both users and its files
INSERT INTO site_images (site_id, user_id, storage_path, thumb_path, file_name)
SELECT id, 'd2000000-0000-0000-0000-000000000002', 'd2/p.jpg', 'd2/p_thumb.jpg', 'p.jpg' FROM sites WHERE name = 'Sandton City rooftop';
UPDATE organizations SET demo_expires_at = NOW() - INTERVAL '1 minute' WHERE demo_expires_at IS NOT NULL;

SET ROLE service_role;
DO $$
DECLARE r RECORD;
BEGIN
    SELECT * INTO r FROM public.expired_demo_teams();
    IF cardinality(r.user_ids) <> 2 THEN RAISE EXCEPTION 'FAIL: expected both demo users, got %', r.user_ids; END IF;
    IF r.file_paths <> ARRAY['d2/p.jpg', 'd2/p_thumb.jpg'] THEN RAISE EXCEPTION 'FAIL: expected the photo and thumbnail paths, got %', r.file_paths; END IF;
    RAISE NOTICE 'PASS: expired sandboxes are listed with their users and files';
END $$;
RESET ROLE;

-- Deleting the team takes its trips with it, then the users can go
DO $$
BEGIN
    DELETE FROM organizations WHERE demo_expires_at IS NOT NULL;
    DELETE FROM auth.users WHERE email LIKE 'demo-%';
    IF EXISTS (SELECT 1 FROM trips) OR EXISTS (SELECT 1 FROM site_images) THEN RAISE EXCEPTION 'FAIL: demo rows survived cleanup'; END IF;
    IF NOT EXISTS (SELECT 1 FROM org_members WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000005') THEN RAISE EXCEPTION 'FAIL: cleanup touched a real user'; END IF;
    RAISE NOTICE 'PASS: cleanup removes the sandbox completely and nothing else';
END $$;
