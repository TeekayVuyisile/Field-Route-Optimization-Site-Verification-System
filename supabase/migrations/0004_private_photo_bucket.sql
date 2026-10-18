-- Makes site-photos private: objects are then only reachable through the
-- storage RLS policies (signed URLs or authenticated downloads), not by
-- anyone holding a public URL.
--
-- Run ONLY after the app version that loads photos with createSignedUrls is
-- live; older builds use getPublicUrl, and their thumbnails would break.
UPDATE storage.buckets SET public = false WHERE id = 'site-photos';
