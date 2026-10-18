-- Teams: organizations with manager/agent roles, trip assignment and status,
-- and RLS rewritten from "owner only" to "team-aware".
--
-- Model
--   * Every user belongs to exactly one organization (org_members.user_id is
--     unique). Users get a personal org on email confirmation, or join the
--     org that invited their email address.
--   * Managers see and manage every trip in their org. Agents see trips they
--     created or that are assigned to them. Sites and photos follow the trip.
--
-- SECURITY NOTE: joining via invitation trusts the email address, so the
-- project MUST have "Confirm email" enabled (Auth > Providers > Email).
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('manager', 'agent')),
    -- Copied from auth.users at join time: clients can't read auth.users,
    -- and the team screen needs to show who's who
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS org_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%'),
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('manager', 'agent')),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (org_id, email)
);

CREATE INDEX IF NOT EXISTS org_invitations_pending_email_idx
    ON org_invitations (email) WHERE accepted_at IS NULL;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'assigned', 'in_progress', 'completed'));
ALTER TABLE trips ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS trips_org_id_idx ON trips (org_id);
CREATE INDEX IF NOT EXISTS trips_assigned_to_idx ON trips (assigned_to);
-- Storage policies below look photos up by path
CREATE INDEX IF NOT EXISTS site_images_storage_path_idx ON site_images (storage_path);

GRANT ALL ON TABLE organizations, org_members, org_invitations TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so policies can consult org_members
-- without recursing into org_members' own RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_org_manager(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM org_members
        WHERE org_id = p_org_id AND user_id = auth.uid() AND role = 'manager'
    )
$$;

-- Joins the oldest pending invitation for the email, or creates a personal
-- org with the user as manager. No-op if the user already has an org.
CREATE OR REPLACE FUNCTION public.provision_membership(p_user_id UUID, p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_email TEXT := lower(btrim(coalesce(p_email, '')));
    v_org_id UUID;
    v_invitation org_invitations;
BEGIN
    SELECT org_id INTO v_org_id FROM org_members WHERE user_id = p_user_id;
    IF FOUND THEN
        RETURN v_org_id;
    END IF;

    SELECT * INTO v_invitation FROM org_invitations
    WHERE email = v_email AND accepted_at IS NULL
    ORDER BY created_at
    LIMIT 1;

    IF FOUND THEN
        INSERT INTO org_members (org_id, user_id, role, email)
        VALUES (v_invitation.org_id, p_user_id, v_invitation.role, v_email);
        UPDATE org_invitations SET accepted_at = NOW() WHERE id = v_invitation.id;
        RETURN v_invitation.org_id;
    END IF;

    INSERT INTO organizations (name)
    VALUES (coalesce(nullif(split_part(v_email, '@', 1), ''), 'My') || '''s team')
    RETURNING id INTO v_org_id;

    INSERT INTO org_members (org_id, user_id, role, email)
    VALUES (v_org_id, p_user_id, 'manager', v_email);
    RETURN v_org_id;
END;
$$;

-- Provision when an email becomes confirmed (at sign-up if confirmation is
-- off, or when the user clicks the link). Never blocks the auth write: a
-- failure here is logged, and ensure_my_membership() repairs it on login.
CREATE OR REPLACE FUNCTION public.handle_auth_user_confirmed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.email_confirmed_at IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.email_confirmed_at IS NULL) THEN
        BEGIN
            PERFORM public.provision_membership(NEW.id, NEW.email);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'provision_membership failed for %: %', NEW.id, SQLERRM;
        END;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
    AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_confirmed();

-- Client-callable: make sure the signed-in user has an org; returns its id
CREATE OR REPLACE FUNCTION public.ensure_my_membership()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user auth.users;
BEGIN
    SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF v_user.email_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'Email not confirmed';
    END IF;
    RETURN public.provision_membership(v_user.id, v_user.email);
END;
$$;

-- Lets an existing user join the team that invited them, provided their
-- current team is just them with no trips (nothing would be orphaned)
CREATE OR REPLACE FUNCTION public.accept_pending_invitation()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user auth.users;
    v_invitation org_invitations;
    v_current org_members;
BEGIN
    SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
    IF NOT FOUND OR v_user.email_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'Email not confirmed';
    END IF;

    SELECT * INTO v_invitation FROM org_invitations
    WHERE email = lower(btrim(v_user.email)) AND accepted_at IS NULL
    ORDER BY created_at
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No pending invitation';
    END IF;

    SELECT * INTO v_current FROM org_members WHERE user_id = v_user.id;
    IF FOUND THEN
        IF v_current.org_id = v_invitation.org_id THEN
            UPDATE org_invitations SET accepted_at = NOW() WHERE id = v_invitation.id;
            RETURN v_invitation.org_id;
        END IF;
        IF EXISTS (SELECT 1 FROM org_members WHERE org_id = v_current.org_id AND user_id <> v_user.id)
           OR EXISTS (SELECT 1 FROM trips WHERE org_id = v_current.org_id) THEN
            RAISE EXCEPTION 'Your current team has other members or trips';
        END IF;
        DELETE FROM organizations WHERE id = v_current.org_id;
    END IF;

    INSERT INTO org_members (org_id, user_id, role, email)
    VALUES (v_invitation.org_id, v_user.id, v_invitation.role, lower(btrim(v_user.email)));
    UPDATE org_invitations SET accepted_at = NOW() WHERE id = v_invitation.id;
    RETURN v_invitation.org_id;
END;
$$;

-- The signed-in user's pending invitation, if any (for an "accept" prompt)
CREATE OR REPLACE FUNCTION public.my_pending_invitation()
RETURNS TABLE (org_id UUID, org_name TEXT, role TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT i.org_id, o.name, i.role
    FROM org_invitations i
    JOIN organizations o ON o.id = i.org_id
    JOIN auth.users u ON u.id = auth.uid()
    WHERE i.email = lower(btrim(u.email))
      AND u.email_confirmed_at IS NOT NULL
      AND i.accepted_at IS NULL
      AND i.org_id IS DISTINCT FROM public.current_org_id()
    ORDER BY i.created_at
    LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.provision_membership(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_auth_user_confirmed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_manager(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_my_membership() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_pending_invitation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_pending_invitation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id(), public.is_org_member(UUID), public.is_org_manager(UUID),
    public.ensure_my_membership(), public.accept_pending_invitation(), public.my_pending_invitation()
    TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill existing users and trips
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    u RECORD;
BEGIN
    FOR u IN
        SELECT id, email FROM auth.users
        WHERE email_confirmed_at IS NOT NULL
           OR EXISTS (SELECT 1 FROM trips WHERE trips.user_id = auth.users.id)
    LOOP
        PERFORM public.provision_membership(u.id, coalesce(u.email, u.id::text || '@unknown.invalid'));
    END LOOP;
END;
$$;

UPDATE trips t SET org_id = m.org_id
FROM org_members m
WHERE t.org_id IS NULL AND m.user_id = t.user_id;

ALTER TABLE trips ALTER COLUMN org_id SET NOT NULL;
-- New trips land in the creator's org unless told otherwise
ALTER TABLE trips ALTER COLUMN org_id SET DEFAULT public.current_org_id();

-- ---------------------------------------------------------------------------
-- Trip write guard + status timestamps
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_trip_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    v_is_manager BOOLEAN;
BEGIN
    -- Dashboard / service-role writes (no end user) are trusted
    IF auth.uid() IS NOT NULL THEN
        v_is_manager := public.is_org_manager(NEW.org_id);

        IF TG_OP = 'UPDATE' THEN
            IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
                RAISE EXCEPTION 'Trips cannot move between teams' USING ERRCODE = '42501';
            END IF;
            IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
                RAISE EXCEPTION 'Trip owner cannot be changed' USING ERRCODE = '42501';
            END IF;
        END IF;

        IF NEW.assigned_to IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_to END) THEN
            -- Agents may only (un)assign their own trips to themselves
            IF NOT v_is_manager AND NOT (
                NEW.user_id = auth.uid() AND (NEW.assigned_to IS NULL OR NEW.assigned_to = auth.uid())
            ) THEN
                RAISE EXCEPTION 'Only a team manager can assign trips' USING ERRCODE = '42501';
            END IF;
            IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM org_members WHERE org_id = NEW.org_id AND user_id = NEW.assigned_to
            ) THEN
                RAISE EXCEPTION 'Trips can only be assigned to members of the same team' USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN
            NEW.started_at := NOW();
        END IF;
        IF NEW.status = 'completed' THEN
            NEW.completed_at := coalesce(NEW.completed_at, NOW());
        ELSE
            NEW.completed_at := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_trip_write ON trips;
CREATE TRIGGER guard_trip_write
    BEFORE INSERT OR UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION public.guard_trip_write();

-- Derive a status for pre-existing trips (first run only). Must come after
-- the trigger above, which stamps started_at / completed_at.
UPDATE trips t SET status = CASE
        WHEN NOT EXISTS (SELECT 1 FROM sites s WHERE s.trip_id = t.id AND NOT s.is_checked) THEN 'completed'
        WHEN EXISTS (SELECT 1 FROM sites s WHERE s.trip_id = t.id AND s.is_checked) THEN 'in_progress'
        ELSE 'draft'
    END
WHERE t.status = 'draft' AND t.started_at IS NULL AND t.completed_at IS NULL
  AND EXISTS (SELECT 1 FROM sites s WHERE s.trip_id = t.id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members see their organization" ON organizations;
CREATE POLICY "Members see their organization" ON organizations
FOR SELECT TO authenticated USING (public.is_org_member(id));

DROP POLICY IF EXISTS "Managers rename their organization" ON organizations;
CREATE POLICY "Managers rename their organization" ON organizations
FOR UPDATE TO authenticated
USING (public.is_org_manager(id)) WITH CHECK (public.is_org_manager(id));

DROP POLICY IF EXISTS "Members see their teammates" ON org_members;
CREATE POLICY "Members see their teammates" ON org_members
FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- Managers can't demote or remove themselves, so a team never loses its
-- last manager by accident
DROP POLICY IF EXISTS "Managers change teammates' roles" ON org_members;
CREATE POLICY "Managers change teammates' roles" ON org_members
FOR UPDATE TO authenticated
USING (public.is_org_manager(org_id) AND user_id <> auth.uid())
WITH CHECK (public.is_org_manager(org_id));

DROP POLICY IF EXISTS "Managers remove teammates" ON org_members;
CREATE POLICY "Managers remove teammates" ON org_members
FOR DELETE TO authenticated
USING (public.is_org_manager(org_id) AND user_id <> auth.uid());

DROP POLICY IF EXISTS "Managers manage invitations" ON org_invitations;
CREATE POLICY "Managers manage invitations" ON org_invitations
FOR ALL TO authenticated
USING (public.is_org_manager(org_id))
WITH CHECK (public.is_org_manager(org_id) AND invited_by = auth.uid());

-- Trips: replace the owner-only policies from 0001
DROP POLICY IF EXISTS "Users can create their own trips" ON trips;
DROP POLICY IF EXISTS "Users can view their own trips" ON trips;
DROP POLICY IF EXISTS "Users can update their own trips" ON trips;
DROP POLICY IF EXISTS "Users can delete their own trips" ON trips;

DROP POLICY IF EXISTS "Trips visible to owner, assignee and team managers" ON trips;
CREATE POLICY "Trips visible to owner, assignee and team managers" ON trips
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR assigned_to = auth.uid() OR public.is_org_manager(org_id));

DROP POLICY IF EXISTS "Members create trips in their own team" ON trips;
CREATE POLICY "Members create trips in their own team" ON trips
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());

DROP POLICY IF EXISTS "Owner, assignee and team managers update trips" ON trips;
CREATE POLICY "Owner, assignee and team managers update trips" ON trips
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR assigned_to = auth.uid() OR public.is_org_manager(org_id))
WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "Owner and team managers delete trips" ON trips;
CREATE POLICY "Owner and team managers delete trips" ON trips
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_org_manager(org_id));

-- Sites follow their trip: if you can see the trip, you can work its sites
DROP POLICY IF EXISTS "Users can manage sites in their own trips" ON sites;
DROP POLICY IF EXISTS "Sites follow their trip" ON sites;
CREATE POLICY "Sites follow their trip" ON sites
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM trips t WHERE t.id = sites.trip_id))
WITH CHECK (EXISTS (SELECT 1 FROM trips t WHERE t.id = sites.trip_id));

-- Photos follow their site; only the uploader or a team manager deletes
DROP POLICY IF EXISTS "Users can manage their own site images" ON site_images;
DROP POLICY IF EXISTS "Photos visible with their site" ON site_images;
CREATE POLICY "Photos visible with their site" ON site_images
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM sites s WHERE s.id = site_images.site_id));

DROP POLICY IF EXISTS "Users add photos to sites they can work" ON site_images;
CREATE POLICY "Users add photos to sites they can work" ON site_images
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM sites s WHERE s.id = site_images.site_id));

DROP POLICY IF EXISTS "Uploader or team manager deletes photos" ON site_images;
CREATE POLICY "Uploader or team manager deletes photos" ON site_images
FOR DELETE TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM sites s JOIN trips t ON t.id = s.trip_id
        WHERE s.id = site_images.site_id AND public.is_org_manager(t.org_id)
    )
);

-- Storage: own-folder policies from 0003 stay. Add team access to photos
-- that belong to trips the user can see.
DROP POLICY IF EXISTS "Team can view photos of visible trips" ON storage.objects;
CREATE POLICY "Team can view photos of visible trips" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'site-photos'
    AND EXISTS (SELECT 1 FROM public.site_images i WHERE i.storage_path = storage.objects.name)
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
        WHERE i.storage_path = storage.objects.name AND public.is_org_manager(t.org_id)
    )
);

-- ---------------------------------------------------------------------------
-- create_trip_with_sites: put the trip in the caller's org (body otherwise
-- unchanged from 0002)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_trip_with_sites(p_title TEXT, p_sites JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    new_trip trips;
    v_org_id UUID := public.current_org_id();
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No team membership';
    END IF;

    IF jsonb_typeof(p_sites) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sites) = 0 THEN
        RAISE EXCEPTION 'A trip needs at least one site';
    END IF;

    INSERT INTO trips (title, user_id, org_id)
    VALUES (p_title, auth.uid(), v_org_id)
    RETURNING * INTO new_trip;

    INSERT INTO sites (trip_id, name, latitude, longitude, order_index, notes)
    SELECT
        new_trip.id,
        s->>'name',
        (s->>'latitude')::DOUBLE PRECISION,
        (s->>'longitude')::DOUBLE PRECISION,
        (ord - 1)::INTEGER,
        COALESCE(s->>'notes', '')
    FROM jsonb_array_elements(p_sites) WITH ORDINALITY AS t(s, ord);

    RETURN jsonb_build_object(
        'trip', to_jsonb(new_trip),
        'sites', (
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.order_index)
            FROM sites x
            WHERE x.trip_id = new_trip.id
        )
    );
END;
$$;
