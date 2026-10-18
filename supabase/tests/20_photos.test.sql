-- site_images + site-photos storage (migrations 0003-0005), across teams

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', NOW()),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', NOW());

-- Seed as superuser: one trip + site + photo per user (separate teams)
INSERT INTO trips (id, user_id, org_id, title) VALUES
    ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
     (SELECT org_id FROM org_members WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'A trip'),
    ('22222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
     (SELECT org_id FROM org_members WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'B trip');
INSERT INTO sites (id, trip_id, name, latitude, longitude) VALUES
    ('a1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'A site', -26, 28),
    ('b2000000-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'B site', -26, 28);
INSERT INTO site_images (site_id, user_id, storage_path, file_name) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001/a1/1.jpg', '1.jpg'),
    ('b2000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002/b2/1.jpg', '1.jpg');
INSERT INTO storage.objects (bucket_id, name) VALUES
    ('site-photos', 'aaaaaaaa-0000-0000-0000-000000000001/a1/1.jpg'),
    ('site-photos', 'bbbbbbbb-0000-0000-0000-000000000002/b2/1.jpg');

SET ROLE authenticated;
SELECT public.test_act_as('aaaaaaaa-0000-0000-0000-000000000001');

DO $$
BEGIN
    IF (SELECT count(*) FROM site_images) <> 1 THEN RAISE EXCEPTION 'FAIL: A should see exactly 1 site_images row'; END IF;
    IF (SELECT count(*) FROM storage.objects) <> 1 THEN RAISE EXCEPTION 'FAIL: A should see exactly 1 photo object'; END IF;
    IF (SELECT name FROM storage.objects) NOT LIKE 'aaaaaaaa-%' THEN RAISE EXCEPTION 'FAIL: A sees someone else''s photo'; END IF;
    RAISE NOTICE 'PASS: photo rows and files are isolated between teams';
END $$;

DO $$
BEGIN
    BEGIN
        INSERT INTO site_images (site_id, user_id, storage_path, file_name)
        VALUES ('a1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'x', 'x');
        RAISE EXCEPTION 'FAIL: recorded a photo as another user';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO site_images (site_id, user_id, storage_path, file_name)
        VALUES ('b2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'x');
        RAISE EXCEPTION 'FAIL: attached a photo to another team''s site';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO storage.objects (bucket_id, name) VALUES ('site-photos', 'bbbbbbbb-0000-0000-0000-000000000002/x/evil.jpg');
        RAISE EXCEPTION 'FAIL: uploaded into another user''s folder';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    INSERT INTO storage.objects (bucket_id, name) VALUES ('site-photos', 'aaaaaaaa-0000-0000-0000-000000000001/a1/2.jpg');
    RAISE NOTICE 'PASS: photo writes limited to own folder and own team''s sites';
END $$;

DELETE FROM storage.objects WHERE name LIKE 'bbbbbbbb-%';
DELETE FROM site_images WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
RESET ROLE;
DO $$
BEGIN
    IF (SELECT count(*) FROM storage.objects WHERE name LIKE 'bbbbbbbb-%') <> 1
       OR (SELECT count(*) FROM site_images WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002') <> 1 THEN
        RAISE EXCEPTION 'FAIL: A deleted B''s photo';
    END IF;
    RAISE NOTICE 'PASS: cannot delete another team''s photos';
END $$;

DO $$
BEGIN
    IF (SELECT public FROM storage.buckets WHERE id = 'site-photos') THEN RAISE EXCEPTION 'FAIL: bucket still public after 0004'; END IF;
    IF (SELECT count(*) FROM pg_indexes WHERE indexname IN
        ('trips_user_id_idx', 'sites_trip_id_order_idx', 'site_images_site_id_idx', 'site_images_user_id_idx',
         'trips_org_id_idx', 'trips_assigned_to_idx', 'site_images_storage_path_idx')) <> 7 THEN
        RAISE EXCEPTION 'FAIL: missing indexes';
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') <> 5 THEN
        RAISE EXCEPTION 'FAIL: expected exactly 5 storage policies (no duplicates from re-running)';
    END IF;
    RAISE NOTICE 'PASS: bucket private, indexes present, 5 storage policies after running migrations twice';
END $$;
