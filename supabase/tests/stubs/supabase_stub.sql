-- Minimal stand-in for what a Supabase project provides, so migrations and
-- RLS can be tested on plain Postgres (scripts/test-db.sh). Only the pieces
-- our migrations touch are modelled.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$$;

-- auth: users + auth.uid() read from the JWT claim, as in Supabase
CREATE SCHEMA auth;
CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    email TEXT,
    email_confirmed_at TIMESTAMP WITH TIME ZONE
);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- storage: buckets, objects with RLS, and foldername()
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT NOT NULL, public BOOLEAN DEFAULT false);
CREATE TABLE storage.objects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bucket_id TEXT REFERENCES storage.buckets(id),
    name TEXT NOT NULL,
    metadata JSONB
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Every path segment except the file name, like Supabase's
CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS
$$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;

-- Test helper: act as a signed-in user (NULL = back to superuser)
CREATE FUNCTION public.test_act_as(p_user_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.test_act_as(UUID) TO authenticated;
