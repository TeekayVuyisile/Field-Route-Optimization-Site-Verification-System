-- Attaching thumbnails to older photos (migration 0008)

-- Manager A, agent C in A's team (uploaded the photo), B in another team
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
    ('a1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Tower', -26, 28);
INSERT INTO site_images (id, site_id, user_id, storage_path, file_name) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003',
     'cccccccc-0000-0000-0000-000000000003/a1/old.jpg', 'old.jpg');
INSERT INTO storage.objects (bucket_id, name) VALUES
    ('site-photos', 'cccccccc-0000-0000-0000-000000000003/a1/old.jpg'),
    ('site-photos', 'aaaaaaaa-0000-0000-0000-000000000001/thumbs/f0.jpg'),
    ('site-photos', 'bbbbbbbb-0000-0000-0000-000000000002/thumbs/f0.jpg');

SET ROLE authenticated;

SELECT public.test_act_as('bbbbbbbb-0000-0000-0000-000000000002');
DO $$
BEGIN
    IF public.set_photo_thumbnail('f0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002/thumbs/f0.jpg') THEN
        RAISE EXCEPTION 'FAIL: another team attached a thumbnail';
    END IF;
    RAISE NOTICE 'PASS: other teams cannot touch the photo';
END $$;

SELECT public.test_act_as('aaaaaaaa-0000-0000-0000-000000000001');
DO $$
BEGIN
    BEGIN
        PERFORM public.set_photo_thumbnail('f0000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003/a1/old.jpg');
        RAISE EXCEPTION 'FAIL: pointed the thumbnail at someone else''s file';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.set_photo_thumbnail('f0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001/thumbs/missing.jpg');
        RAISE EXCEPTION 'FAIL: pointed the thumbnail at a file that does not exist';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    IF NOT public.set_photo_thumbnail('f0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001/thumbs/f0.jpg') THEN
        RAISE EXCEPTION 'FAIL: the team manager could not add a thumbnail';
    END IF;
    IF public.set_photo_thumbnail('f0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001/thumbs/f0.jpg') THEN
        RAISE EXCEPTION 'FAIL: replaced an existing thumbnail';
    END IF;
    RAISE NOTICE 'PASS: a manager adds a thumbnail from their own folder, once';
END $$;

-- The assigned teammate (not the manager) can now see the manager-made thumbnail
SELECT public.test_act_as('cccccccc-0000-0000-0000-000000000003');
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = 'aaaaaaaa-0000-0000-0000-000000000001/thumbs/f0.jpg') THEN
        RAISE EXCEPTION 'FAIL: the team cannot see the new thumbnail';
    END IF;
    RAISE NOTICE 'PASS: the thumbnail is visible to the team';
END $$;
RESET ROLE;

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.set_photo_thumbnail(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL: signed-out visitors can call set_photo_thumbnail';
    END IF;
    RAISE NOTICE 'PASS: closed to signed-out visitors';
END $$;
