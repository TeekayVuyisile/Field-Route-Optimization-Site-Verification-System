-- 0009: private demo sandboxes for portfolio visitors
--
-- "Try the demo" (api/demo/start) creates a fresh manager + agent pair for
-- each visitor and calls seed_demo_team() to give them a realistic team.
-- Sandboxes expire (organizations.demo_expires_at) and are removed by
-- api/demo/cleanup. Visitors never share data and never see real teams:
-- a demo team is an ordinary team under the same row-level security.
--
-- The seed/cleanup functions are for the server's service role only.
-- Idempotent: safe to run again in the SQL editor.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS organizations_demo_expires_idx ON organizations (demo_expires_at) WHERE demo_expires_at IS NOT NULL;

-- A demo team can't invite anyone: a real person invited into one would
-- join it on sign-up and lose it when the sandbox expires
CREATE OR REPLACE FUNCTION public.block_demo_invitations()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM organizations WHERE id = NEW.org_id AND demo_expires_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Demo teams can''t invite people' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_demo_invitations ON org_invitations;
CREATE TRIGGER block_demo_invitations
    BEFORE INSERT ON org_invitations
    FOR EACH ROW EXECUTE FUNCTION public.block_demo_invitations();

-- Builds one sandbox. Both users already exist (created confirmed, so the
-- 0005 trigger gave each a personal team). The manager's team becomes the
-- demo team; the agent leaves their own and joins it.
CREATE OR REPLACE FUNCTION public.seed_demo_team(p_manager UUID, p_agent UUID, p_expires_at TIMESTAMP WITH TIME ZONE)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_org UUID;
    v_agent_org UUID;
    v_checklist JSONB := jsonb_build_object('name', 'WiFi site audit', 'items', jsonb_build_array(
        jsonb_build_object('id', 'power', 'label', 'Router powered on', 'type', 'check', 'required', true),
        jsonb_build_object('id', 'ssid', 'label', 'Public SSID visible', 'type', 'text', 'required', true),
        jsonb_build_object('id', 'speed', 'label', 'Download speed (Mbps)', 'type', 'number', 'required', false),
        jsonb_build_object('id', 'pic', 'label', 'Photo of the equipment', 'type', 'photo', 'required', false)
    ));
    v_audit UUID := gen_random_uuid();
    v_soweto UUID := gen_random_uuid();
    v_pretoria UUID := gen_random_uuid();
BEGIN
    SELECT org_id INTO v_org FROM org_members WHERE user_id = p_manager AND role = 'manager';
    SELECT org_id INTO v_agent_org FROM org_members WHERE user_id = p_agent;
    IF v_org IS NULL OR v_agent_org IS NULL OR v_org = v_agent_org THEN
        RAISE EXCEPTION 'seed_demo_team needs two freshly created users' USING ERRCODE = '22023';
    END IF;

    UPDATE organizations SET name = 'Demo team', demo_expires_at = p_expires_at WHERE id = v_org;

    -- The agent joins the manager's team (their own empty team goes)
    DELETE FROM org_members WHERE user_id = p_agent;
    DELETE FROM organizations WHERE id = v_agent_org
        AND NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = v_agent_org);
    INSERT INTO org_members (org_id, user_id, role, email)
    SELECT v_org, p_agent, 'agent', email FROM auth.users WHERE id = p_agent;

    INSERT INTO checklist_templates (org_id, name, items, created_by)
    VALUES (v_org, v_checklist ->> 'name', v_checklist -> 'items', p_manager);

    -- 1. In progress: the agent is half-way through, one check-in flagged
    INSERT INTO trips (id, user_id, org_id, title, assigned_to, status, checklist, created_at)
    VALUES (v_audit, p_manager, v_org, 'Sandton WiFi audit', p_agent, 'in_progress', v_checklist, NOW() - INTERVAL '1 day');
    INSERT INTO sites (trip_id, order_index, name, latitude, longitude, is_checked, checked_at, check_lat, check_lng, check_accuracy_m, check_note, notes, checklist_answers)
    VALUES
        (v_audit, 0, 'Sandton City rooftop', -26.1076, 28.0567, TRUE, NOW() - INTERVAL '3 hours', -26.10785, 28.05690, 8, NULL,
         'Access via the loading bay; ask security for the roof key.', '{"power": true, "ssid": "Sandton-Free", "speed": 48.2}'),
        (v_audit, 1, 'Nelson Mandela Square kiosk', -26.1072, 28.0546, TRUE, NOW() - INTERVAL '150 minutes', -26.10728, 28.05475, 11, NULL,
         '', '{"power": true, "ssid": "Sandton-Free", "speed": 36.9}'),
        (v_audit, 2, 'Rosebank Gautrain station', -26.1449, 28.0441, TRUE, NOW() - INTERVAL '2 hours', -26.14070, 28.04790, 15,
         'Pin is at the street entrance; the equipment room is across the station.', 'Cabinet door seal damaged.', '{"power": true, "ssid": "Gautrain-WiFi"}'),
        (v_audit, 3, 'Melrose Arch hub', -26.1325, 28.0680, TRUE, NOW() - INTERVAL '75 minutes', -26.13262, 28.06788, 9, NULL,
         '', '{"power": true, "ssid": "Melrose-Arch", "speed": 61}'),
        (v_audit, 4, 'Illovo cabinet 7', -26.1310, 28.0520, TRUE, NOW() - INTERVAL '40 minutes', -26.13088, 28.05215, 12, NULL,
         'Very slow; reported to the ISP.', '{"power": true, "ssid": "Illovo-Free", "speed": 2.1}'),
        (v_audit, 5, 'Hyde Park library', -26.1253, 28.0352, FALSE, NULL, NULL, NULL, NULL, NULL, '', '{}'),
        (v_audit, 6, 'Parkhurst 4th Avenue cabinet', -26.1381, 28.0186, FALSE, NULL, NULL, NULL, NULL, NULL, '', '{}'),
        (v_audit, 7, 'Greenside clinic', -26.1471, 28.0130, FALSE, NULL, NULL, NULL, NULL, NULL, '', '{}');

    -- 2. Assigned, not started
    INSERT INTO trips (id, user_id, org_id, title, assigned_to, status, checklist, created_at)
    VALUES (v_soweto, p_manager, v_org, 'Soweto fibre cabinets', p_agent, 'assigned', v_checklist, NOW() - INTERVAL '3 hours');
    INSERT INTO sites (trip_id, order_index, name, latitude, longitude) VALUES
        (v_soweto, 0, 'Vilakazi Street cabinet', -26.2381, 27.9087),
        (v_soweto, 1, 'Orlando Towers', -26.2546, 27.9257),
        (v_soweto, 2, 'Maponya Mall', -26.2615, 27.9011),
        (v_soweto, 3, 'Jabulani Mall', -26.2464, 27.8605),
        (v_soweto, 4, 'Soweto Theatre', -26.2440, 27.8570);

    -- 3. Completed last week, no checklist
    INSERT INTO trips (id, user_id, org_id, title, assigned_to, status, created_at)
    VALUES (v_pretoria, p_manager, v_org, 'Pretoria CBD survey', p_manager, 'completed', NOW() - INTERVAL '8 days');
    INSERT INTO sites (trip_id, order_index, name, latitude, longitude, is_checked, checked_at, check_lat, check_lng, check_accuracy_m, notes) VALUES
        (v_pretoria, 0, 'Church Square', -25.7461, 28.1881, TRUE, NOW() - INTERVAL '7 days 5 hours', -25.74622, 28.18826, 10, 'Two access points replaced.'),
        (v_pretoria, 1, 'Pretoria station', -25.7584, 28.1895, TRUE, NOW() - INTERVAL '7 days 4 hours', -25.75851, 28.18961, 14, ''),
        (v_pretoria, 2, 'Union Buildings gardens', -25.7400, 28.2121, TRUE, NOW() - INTERVAL '7 days 3 hours', -25.74014, 28.21198, 9, ''),
        (v_pretoria, 3, 'Hatfield Gautrain station', -25.7479, 28.2380, TRUE, NOW() - INTERVAL '7 days 2 hours', -25.74805, 28.23822, 7, 'All good.');
    UPDATE trips SET completed_at = NOW() - INTERVAL '7 days 2 hours', started_at = NOW() - INTERVAL '7 days 5 hours' WHERE id = v_pretoria;

    RETURN v_org;
END;
$$;

-- Sandboxes past their expiry: the team, its members and every photo file
-- (and thumbnail) to remove from storage before the rows go
CREATE OR REPLACE FUNCTION public.expired_demo_teams()
RETURNS TABLE (org_id UUID, user_ids UUID[], file_paths TEXT[])
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT o.id,
        ARRAY(SELECT m.user_id FROM org_members m WHERE m.org_id = o.id),
        ARRAY(
            SELECT p FROM site_images i JOIN sites s ON s.id = i.site_id JOIN trips t ON t.id = s.trip_id,
                LATERAL unnest(ARRAY[i.storage_path, i.thumb_path]) AS p
            WHERE t.org_id = o.id AND p IS NOT NULL
        )
    FROM organizations o
    WHERE o.demo_expires_at IS NOT NULL AND o.demo_expires_at < NOW()
    LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_team(UUID, UUID, TIMESTAMP WITH TIME ZONE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expired_demo_teams() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_team(UUID, UUID, TIMESTAMP WITH TIME ZONE) TO service_role;
GRANT EXECUTE ON FUNCTION public.expired_demo_teams() TO service_role;
