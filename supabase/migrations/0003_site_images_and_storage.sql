-- Brings the repo in line with the live project: site_images and the
-- site-photos storage policies were created by hand in the dashboard and
-- never saved as SQL. Definitions copied from the live catalog (Oct 2026).
-- Idempotent: on the live project only the new indexes actually change.

CREATE TABLE IF NOT EXISTS site_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    -- Explicit so the RLS check below doesn't need a join through sites/trips
    user_id UUID NOT NULL REFERENCES auth.users(id),
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

GRANT ALL ON TABLE site_images TO authenticated;
GRANT ALL ON TABLE site_images TO service_role;

ALTER TABLE site_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own site images" ON site_images;
CREATE POLICY "Users can manage their own site images"
ON site_images FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Photo bucket. Live is currently public; 0004 makes it private once the
-- app reads photos through signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-photos', 'site-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Objects live under {user_id}/{site_id}/{file}; each user may only touch
-- their own top-level folder
DROP POLICY IF EXISTS "Allow individual views" ON storage.objects;
CREATE POLICY "Allow individual views"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'site-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Allow individual uploads" ON storage.objects;
CREATE POLICY "Allow individual uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'site-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Allow individual deletes" ON storage.objects;
CREATE POLICY "Allow individual deletes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'site-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Foreign keys aren't indexed automatically in Postgres. These back the
-- queries the app runs on every trip load and every RLS check.
CREATE INDEX IF NOT EXISTS trips_user_id_idx ON trips (user_id);
CREATE INDEX IF NOT EXISTS sites_trip_id_order_idx ON sites (trip_id, order_index);
CREATE INDEX IF NOT EXISTS site_images_site_id_idx ON site_images (site_id);
CREATE INDEX IF NOT EXISTS site_images_user_id_idx ON site_images (user_id);
