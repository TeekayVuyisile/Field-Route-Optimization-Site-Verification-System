-- Site checklists (migration 0007)

-- A manages a team with agent C; B is in another team
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', NOW()),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', NOW());
INSERT INTO org_invitations (org_id, email, role)
VALUES ((SELECT org_id FROM org_members WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'c@example.com', 'agent');
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('cccccccc-0000-0000-0000-000000000003', 'c@example.com', NOW());

INSERT INTO trips (id, user_id, org_id, title, assigned_to) VALUES
    ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
     (SELECT org_id FROM org_members WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'A trip',
     'cccccccc-0000-0000-0000-000000000003');
INSERT INTO sites (id, trip_id, name, latitude, longitude) VALUES
    ('a1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Tower', -26, 28),
    ('a2000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Cabinet', -26, 28);

SET ROLE authenticated;

-- Manager A writes a template; agent C can read but not change it
SELECT public.test_act_as('aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO checklist_templates (id, name, items) VALUES (
    'c0000000-0000-0000-0000-000000000001', 'WiFi audit',
    '[{"id":"power","label":"Power on","type":"check","required":true},
      {"id":"ssid","label":"SSID seen","type":"text","required":true},
      {"id":"speed","label":"Speed (Mbps)","type":"number","required":false},
      {"id":"pic","label":"Photo of the router","type":"photo","required":true}]'
);
UPDATE trips SET checklist = (SELECT jsonb_build_object('name', name, 'items', items) FROM checklist_templates)
WHERE id = '11111111-0000-0000-0000-000000000001';

SELECT public.test_act_as('cccccccc-0000-0000-0000-000000000003');
DO $$
BEGIN
    IF (SELECT count(*) FROM checklist_templates) <> 1 THEN RAISE EXCEPTION 'FAIL: an agent cannot see the team checklist'; END IF;
    UPDATE checklist_templates SET name = 'Hacked';
    IF (SELECT name FROM checklist_templates) <> 'WiFi audit' THEN RAISE EXCEPTION 'FAIL: an agent edited a checklist'; END IF;
    BEGIN
        INSERT INTO checklist_templates (name) VALUES ('Agent list');
        RAISE EXCEPTION 'FAIL: an agent created a checklist';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        UPDATE trips SET checklist = NULL WHERE id = '11111111-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'FAIL: the assigned agent removed the trip checklist';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: agents read checklists but only managers and owners change them';
END $$;

DO $$
DECLARE r sites%ROWTYPE;
BEGIN
    BEGIN
        UPDATE sites SET is_checked = TRUE, checklist_answers = '{"power": true}' WHERE id = 'a1000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'FAIL: checked in with a required item unanswered';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE '%SSID seen%' THEN RAISE EXCEPTION 'FAIL: the error should name the missing item, got: %', SQLERRM; END IF;
    END;
    BEGIN
        UPDATE sites SET is_checked = TRUE, checklist_answers = '{"power": true, "ssid": "   "}' WHERE id = 'a1000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'FAIL: a blank answer counted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- Answers saved without checking in are fine (filled in as the agent goes)
    UPDATE sites SET checklist_answers = '{"power": true}' WHERE id = 'a2000000-0000-0000-0000-000000000002';

    -- All required non-photo items answered: allowed (photo items are the app's job)
    UPDATE sites SET is_checked = TRUE, checklist_answers = '{"power": true, "ssid": "City-WiFi", "speed": 42.5}'
    WHERE id = 'a1000000-0000-0000-0000-000000000001' RETURNING * INTO r;
    IF NOT r.is_checked THEN RAISE EXCEPTION 'FAIL: a complete checklist was refused'; END IF;

    -- Later edits to a checked site aren't blocked by the checklist
    UPDATE sites SET notes = 'Done' WHERE id = 'a1000000-0000-0000-0000-000000000001';
    RAISE NOTICE 'PASS: required items are enforced at check-in only';
END $$;

-- Another team sees nothing
SELECT public.test_act_as('bbbbbbbb-0000-0000-0000-000000000002');
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM checklist_templates) THEN RAISE EXCEPTION 'FAIL: another team sees A''s checklists'; END IF;
    RAISE NOTICE 'PASS: checklists stay within the team';
END $$;

-- The owner can drop the checklist; sites without one check in freely
SELECT public.test_act_as('aaaaaaaa-0000-0000-0000-000000000001');
DO $$
BEGIN
    UPDATE trips SET checklist = NULL WHERE id = '11111111-0000-0000-0000-000000000001';
    UPDATE sites SET is_checked = TRUE WHERE id = 'a2000000-0000-0000-0000-000000000002';
    DELETE FROM checklist_templates;
    IF EXISTS (SELECT 1 FROM checklist_templates) THEN RAISE EXCEPTION 'FAIL: the manager could not delete a template'; END IF;
    RAISE NOTICE 'PASS: owners and managers manage trip checklists and templates';
END $$;
RESET ROLE;
