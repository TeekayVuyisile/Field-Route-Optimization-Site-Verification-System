-- Trip write helpers called via supabase.rpc().
-- SECURITY INVOKER: both run as the calling user, so the existing RLS
-- policies on trips/sites still apply.

-- Creates a trip and all its sites in ONE transaction. Previously the client
-- inserted the trip, then the sites; if the second insert failed an empty
-- trip was left behind and retrying created duplicates.
-- p_sites: [{ "name", "latitude", "longitude", "notes"? }, ...] in visiting order.
-- Returns { "trip": {...}, "sites": [...] } so the client gets the real ids.
CREATE OR REPLACE FUNCTION public.create_trip_with_sites(p_title TEXT, p_sites JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    new_trip trips;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF jsonb_typeof(p_sites) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sites) = 0 THEN
        RAISE EXCEPTION 'A trip needs at least one site';
    END IF;

    INSERT INTO trips (title, user_id)
    VALUES (p_title, auth.uid())
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

-- Persists a visiting order: p_site_ids[1] gets order_index 0, and so on.
-- One statement, so the order is never half-written.
CREATE OR REPLACE FUNCTION public.set_site_order(p_site_ids UUID[])
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
    UPDATE sites s
    SET order_index = (t.ord - 1)::INTEGER
    FROM unnest(p_site_ids) WITH ORDINALITY AS t(id, ord)
    WHERE s.id = t.id;
$$;

REVOKE EXECUTE ON FUNCTION public.create_trip_with_sites(TEXT, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_site_order(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trip_with_sites(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_site_order(UUID[]) TO authenticated;
