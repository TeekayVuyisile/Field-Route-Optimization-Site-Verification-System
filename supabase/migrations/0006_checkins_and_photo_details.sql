-- 0006: verified check-ins and photo thumbnails/location
--
-- Check-ins: the app sends where the phone was (check_lat/lng/accuracy) and
-- when (checked_at, client time so offline check-ins keep their real time).
-- The database works out the distance to the site and whether it's beyond
-- the team's radius, so a client can't mark its own check-in as verified.
--
-- Photos: a small thumbnail per new photo (thumb_path) for lists, plus when
-- and where it was taken. Storage policies now also cover thumbnail files.
--
-- Idempotent: safe to run again in the SQL editor.

-- ---------------------------------------------------------------------------
-- Team setting: how far from a site a check-in may be before it's flagged
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS checkin_radius_m INTEGER NOT NULL DEFAULT 150
        CHECK (checkin_radius_m BETWEEN 25 AND 5000);

-- ---------------------------------------------------------------------------
-- Check-in details on sites
-- ---------------------------------------------------------------------------
ALTER TABLE sites ADD COLUMN IF NOT EXISTS checked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS check_lat DOUBLE PRECISION CHECK (check_lat BETWEEN -90 AND 90);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS check_lng DOUBLE PRECISION CHECK (check_lng BETWEEN -180 AND 180);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS check_accuracy_m REAL CHECK (check_accuracy_m >= 0);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS check_distance_m REAL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS check_flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS check_note TEXT CHECK (length(check_note) <= 500);

-- Great-circle distance in metres (haversine), same maths as src/lib/geo.js
CREATE OR REPLACE FUNCTION public.distance_m(lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION, lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT 2 * 6371000 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ));
$$;

-- Stamps check-ins. Distance and flag are always computed here: whatever a
-- client sends for check_distance_m / check_flagged is overwritten.
CREATE OR REPLACE FUNCTION public.stamp_site_checkin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    v_radius INTEGER;
    v_new_checkin BOOLEAN;
BEGIN
    IF NOT NEW.is_checked THEN
        NEW.checked_at := NULL;
        NEW.check_lat := NULL;
        NEW.check_lng := NULL;
        NEW.check_accuracy_m := NULL;
        NEW.check_distance_m := NULL;
        NEW.check_flagged := FALSE;
        NEW.check_note := NULL;
        RETURN NEW;
    END IF;

    v_new_checkin := TG_OP = 'INSERT' OR NOT OLD.is_checked;

    -- Already checked and nothing that affects the result changed (e.g. a
    -- notes edit), or a check-in from before 0006 with no position: keep
    -- the stored verdict
    IF NOT v_new_checkin AND (
        (NEW.check_lat IS NULL AND OLD.check_lat IS NULL)
        OR (NEW.check_lat IS NOT DISTINCT FROM OLD.check_lat
            AND NEW.check_lng IS NOT DISTINCT FROM OLD.check_lng
            AND NEW.latitude IS NOT DISTINCT FROM OLD.latitude
            AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude)
    ) THEN
        NEW.checked_at := OLD.checked_at;
        NEW.check_distance_m := OLD.check_distance_m;
        NEW.check_flagged := OLD.check_flagged;
        RETURN NEW;
    END IF;

    -- Client time (offline check-ins sync later), but never in the future
    IF v_new_checkin THEN
        NEW.checked_at := LEAST(coalesce(NEW.checked_at, NOW()), NOW());
    ELSE
        NEW.checked_at := OLD.checked_at;
    END IF;

    IF NEW.check_lat IS NULL OR NEW.check_lng IS NULL THEN
        -- No position: can't be verified
        NEW.check_distance_m := NULL;
        NEW.check_flagged := TRUE;
    ELSE
        SELECT o.checkin_radius_m INTO v_radius
        FROM trips t JOIN organizations o ON o.id = t.org_id
        WHERE t.id = NEW.trip_id;

        NEW.check_distance_m := round(public.distance_m(NEW.latitude, NEW.longitude, NEW.check_lat, NEW.check_lng)::numeric, 1);
        NEW.check_flagged := NEW.check_distance_m > coalesce(v_radius, 150);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_site_checkin ON sites;
CREATE TRIGGER stamp_site_checkin
    BEFORE INSERT OR UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION public.stamp_site_checkin();

-- ---------------------------------------------------------------------------
-- Photo details
-- ---------------------------------------------------------------------------
ALTER TABLE site_images ADD COLUMN IF NOT EXISTS thumb_path TEXT;
ALTER TABLE site_images ADD COLUMN IF NOT EXISTS taken_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE site_images ADD COLUMN IF NOT EXISTS taken_lat DOUBLE PRECISION CHECK (taken_lat BETWEEN -90 AND 90);
ALTER TABLE site_images ADD COLUMN IF NOT EXISTS taken_lng DOUBLE PRECISION CHECK (taken_lng BETWEEN -180 AND 180);
CREATE INDEX IF NOT EXISTS site_images_thumb_path_idx ON site_images (thumb_path);

-- Storage: teammates and managers reach thumbnails the same way as photos
DROP POLICY IF EXISTS "Team can view photos of visible trips" ON storage.objects;
CREATE POLICY "Team can view photos of visible trips" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'site-photos'
    AND EXISTS (
        SELECT 1 FROM public.site_images i
        WHERE i.storage_path = storage.objects.name OR i.thumb_path = storage.objects.name
    )
);

DROP POLICY IF EXISTS "Team managers delete photos of their trips" ON storage.objects;
CREATE POLICY "Team managers delete photos of their trips" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'site-photos'
    AND EXISTS (
        SELECT 1 FROM public.site_images i
        JOIN public.sites s ON s.id = i.site_id
        JOIN public.trips t ON t.id = s.trip_id
        WHERE (i.storage_path = storage.objects.name OR i.thumb_path = storage.objects.name)
          AND public.is_org_manager(t.org_id)
    )
);
