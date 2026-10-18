-- 0008: thumbnails for photos taken before 0006
--
-- site_images has no UPDATE policy (photos are write-once), so attaching a
-- thumbnail to an older photo goes through this one narrow function. A team
-- manager makes the thumbnails in the app and stores them in their OWN
-- storage folder (storage only lets users write there).
--
-- Idempotent: safe to run again in the SQL editor.

CREATE OR REPLACE FUNCTION public.set_photo_thumbnail(p_photo_id UUID, p_thumb_path TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
    END IF;

    -- The thumbnail must be a real file in the caller's own folder
    IF p_thumb_path IS NULL OR split_part(p_thumb_path, '/', 1) <> v_uid::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'site-photos' AND name = p_thumb_path) THEN
        RAISE EXCEPTION 'Thumbnail must be an uploaded file in your own folder' USING ERRCODE = '22023';
    END IF;

    -- Only the uploader or a manager of the photo's team; never replaces one
    UPDATE site_images i SET thumb_path = p_thumb_path
    FROM sites s JOIN trips t ON t.id = s.trip_id
    WHERE i.id = p_photo_id AND s.id = i.site_id AND i.thumb_path IS NULL
      AND (i.user_id = v_uid OR public.is_org_manager(t.org_id));
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_photo_thumbnail(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_photo_thumbnail(UUID, TEXT) TO authenticated;
