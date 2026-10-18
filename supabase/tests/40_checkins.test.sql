-- Verified check-ins and photo thumbnails (migration 0006)

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', NOW()),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', NOW());

-- A's trip with a site at (-26, 28); A manages their own (personal) team
INSERT INTO trips (id, user_id, org_id, title) VALUES
    ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
     (SELECT org_id FROM org_members WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'A trip');
INSERT INTO sites (id, trip_id, name, latitude, longitude) VALUES
    ('a1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Near', -26, 28),
    ('a2000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Far', -26, 28),
    ('a3000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'No GPS', -26, 28);

SET ROLE authenticated;
SELECT public.test_act_as('aaaaaaaa-0000-0000-0000-000000000001');

DO $$
DECLARE r sites%ROWTYPE;
BEGIN
    -- ~55 m north of the site, with a client trying to claim it's verified anyway
    UPDATE sites SET is_checked = TRUE, check_lat = -25.9995, check_lng = 28, check_accuracy_m = 12,
                     checked_at = NOW() - INTERVAL '2 hours', check_flagged = TRUE, check_distance_m = 0
    WHERE id = 'a1000000-0000-0000-0000-000000000001' RETURNING * INTO r;
    IF r.check_flagged THEN RAISE EXCEPTION 'FAIL: a check-in 55 m away was flagged'; END IF;
    IF r.check_distance_m NOT BETWEEN 50 AND 60 THEN RAISE EXCEPTION 'FAIL: distance % m, expected ~55', r.check_distance_m; END IF;
    IF r.checked_at > NOW() - INTERVAL '1 hour' THEN RAISE EXCEPTION 'FAIL: an offline check-in lost its real time'; END IF;

    -- ~1.1 km away, client claims it isn't flagged
    UPDATE sites SET is_checked = TRUE, check_lat = -25.99, check_lng = 28, check_flagged = FALSE, check_note = 'Gate locked'
    WHERE id = 'a2000000-0000-0000-0000-000000000002' RETURNING * INTO r;
    IF NOT r.check_flagged THEN RAISE EXCEPTION 'FAIL: a check-in 1.1 km away was not flagged'; END IF;
    IF r.check_note <> 'Gate locked' THEN RAISE EXCEPTION 'FAIL: the reason was lost'; END IF;

    -- No position at all, and a check-in time in the future
    UPDATE sites SET is_checked = TRUE, checked_at = NOW() + INTERVAL '3 days'
    WHERE id = 'a3000000-0000-0000-0000-000000000003' RETURNING * INTO r;
    IF NOT r.check_flagged OR r.check_distance_m IS NOT NULL THEN RAISE EXCEPTION 'FAIL: a check-in without a position counted as verified'; END IF;
    IF r.checked_at > NOW() THEN RAISE EXCEPTION 'FAIL: a future check-in time was accepted'; END IF;
    RAISE NOTICE 'PASS: the database measures check-ins and the client cannot overrule it';
END $$;

DO $$
DECLARE r sites%ROWTYPE;
BEGIN
    -- A notes edit keeps the verdict, even if the client sends a fake one
    UPDATE sites SET notes = 'All good', check_flagged = FALSE WHERE id = 'a2000000-0000-0000-0000-000000000002' RETURNING * INTO r;
    IF NOT r.check_flagged THEN RAISE EXCEPTION 'FAIL: a notes edit cleared the flag'; END IF;

    -- Undoing a check-in clears every check-in field
    UPDATE sites SET is_checked = FALSE WHERE id = 'a2000000-0000-0000-0000-000000000002' RETURNING * INTO r;
    IF r.checked_at IS NOT NULL OR r.check_lat IS NOT NULL OR r.check_flagged OR r.check_note IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: undoing a check-in left check-in details behind';
    END IF;
    RAISE NOTICE 'PASS: edits keep the verdict and undo clears it';
END $$;

DO $$
DECLARE r sites%ROWTYPE;
BEGIN
    -- The manager widens the radius to 2 km: the same 1.1 km check-in now passes
    UPDATE organizations SET checkin_radius_m = 2000;
    UPDATE sites SET is_checked = TRUE, check_lat = -25.99, check_lng = 28
    WHERE id = 'a2000000-0000-0000-0000-000000000002' RETURNING * INTO r;
    IF r.check_flagged THEN RAISE EXCEPTION 'FAIL: the team radius was ignored'; END IF;

    BEGIN
        UPDATE organizations SET checkin_radius_m = 5;
        RAISE EXCEPTION 'FAIL: accepted a 5 m radius';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    RAISE NOTICE 'PASS: the team radius applies and is kept sensible';
END $$;

-- Thumbnails: a teammate can see one only through a photo record
RESET ROLE;
INSERT INTO org_invitations (org_id, email, role)
VALUES ((SELECT org_id FROM org_members WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'c@example.com', 'agent');
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('cccccccc-0000-0000-0000-000000000003', 'c@example.com', NOW());
UPDATE trips SET assigned_to = 'cccccccc-0000-0000-0000-000000000003' WHERE id = '11111111-0000-0000-0000-000000000001';
INSERT INTO site_images (site_id, user_id, storage_path, thumb_path, file_name) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000001/a1/p.jpg', 'aaaaaaaa-0000-0000-0000-000000000001/a1/p_thumb.jpg', 'p.jpg');
INSERT INTO storage.objects (bucket_id, name) VALUES
    ('site-photos', 'aaaaaaaa-0000-0000-0000-000000000001/a1/p.jpg'),
    ('site-photos', 'aaaaaaaa-0000-0000-0000-000000000001/a1/p_thumb.jpg'),
    ('site-photos', 'aaaaaaaa-0000-0000-0000-000000000001/a1/stray.jpg');

SET ROLE authenticated;
SELECT public.test_act_as('cccccccc-0000-0000-0000-000000000003');
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%p_thumb.jpg') THEN
        RAISE EXCEPTION 'FAIL: an assigned teammate cannot see the thumbnail';
    END IF;
    IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%stray.jpg') THEN
        RAISE EXCEPTION 'FAIL: a teammate can see a file no photo record points to';
    END IF;
    RAISE NOTICE 'PASS: thumbnails follow their photo record';
END $$;

SELECT public.test_act_as('bbbbbbbb-0000-0000-0000-000000000002');
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE 'aaaaaaaa-%') THEN
        RAISE EXCEPTION 'FAIL: another team can see photos or thumbnails';
    END IF;
    -- RLS hides A's team from B, so this matches no rows
    UPDATE organizations SET checkin_radius_m = 5000
    WHERE id = (SELECT org_id FROM org_members WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001');
END $$;

RESET ROLE;
DO $$
BEGIN
    IF (SELECT checkin_radius_m FROM organizations o JOIN org_members m ON m.org_id = o.id
        WHERE m.user_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 2000 THEN
        RAISE EXCEPTION 'FAIL: another team changed A''s radius';
    END IF;
    RAISE NOTICE 'PASS: other teams see nothing and cannot change the radius';
END $$;
