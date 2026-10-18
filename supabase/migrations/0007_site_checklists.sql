-- 0007: site checklists
--
-- Managers keep checklist templates for their team. A trip gets a COPY of
-- one (trips.checklist), so editing or deleting a template never changes
-- what agents already answered. Answers live on each site
-- (sites.checklist_answers, keyed by item id) and travel through the app's
-- offline outbox like any other site edit.
--
-- Items: [{ "id": text, "label": text, "type": "check"|"text"|"number"|"photo", "required": bool }]
-- Required check/text/number items must be answered before a site can be
-- checked in (enforced here). "photo" items are enforced by the app only: a
-- photo taken offline may reach the server after the check-in does.
--
-- Idempotent: safe to run again in the SQL editor.

CREATE TABLE IF NOT EXISTS checklist_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    items JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 50),
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_templates_org_id_idx ON checklist_templates (org_id);
-- Table access; RLS below decides which rows
GRANT ALL ON TABLE checklist_templates TO authenticated, service_role;

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members see their team's checklists" ON checklist_templates;
CREATE POLICY "Members see their team's checklists" ON checklist_templates
FOR SELECT TO authenticated USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Managers manage their team's checklists" ON checklist_templates;
CREATE POLICY "Managers manage their team's checklists" ON checklist_templates
FOR ALL TO authenticated
USING (public.is_org_manager(org_id))
WITH CHECK (public.is_org_manager(org_id));

-- A trip's own copy of its checklist: { "name": text, "items": [...] }, or NULL
ALTER TABLE trips ADD COLUMN IF NOT EXISTS checklist JSONB
    CHECK (checklist IS NULL OR jsonb_typeof(checklist -> 'items') = 'array');

ALTER TABLE sites ADD COLUMN IF NOT EXISTS checklist_answers JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(checklist_answers) = 'object');

-- Only the trip's owner or a team manager may set or change its checklist
-- (an assigned agent could otherwise remove it to skip the questions)
CREATE OR REPLACE FUNCTION public.guard_trip_checklist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND NEW.checklist IS DISTINCT FROM OLD.checklist
       AND NEW.user_id IS DISTINCT FROM auth.uid()
       AND NOT public.is_org_manager(NEW.org_id) THEN
        RAISE EXCEPTION 'Only the trip owner or a team manager can change its checklist' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_trip_checklist ON trips;
CREATE TRIGGER guard_trip_checklist
    BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION public.guard_trip_checklist();

-- True when an answer satisfies a required item of that type. Never NULL:
-- a missing answer must count as unanswered, and NOT NULL is still NULL.
CREATE OR REPLACE FUNCTION public.checklist_answered(p_type TEXT, p_value JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(CASE p_type
        WHEN 'check' THEN p_value = 'true'::jsonb
        WHEN 'text' THEN jsonb_typeof(p_value) = 'string' AND btrim(p_value #>> '{}') <> ''
        WHEN 'number' THEN jsonb_typeof(p_value) = 'number'
        ELSE TRUE -- 'photo' and unknown types: checked by the app
    END, FALSE);
$$;

-- A new check-in must answer the trip's required items
CREATE OR REPLACE FUNCTION public.require_checklist_on_checkin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    v_missing TEXT;
BEGIN
    IF NOT NEW.is_checked OR (TG_OP = 'UPDATE' AND OLD.is_checked) THEN
        RETURN NEW;
    END IF;

    SELECT string_agg(item ->> 'label', ', ')
    INTO v_missing
    FROM trips t, jsonb_array_elements(t.checklist -> 'items') AS item
    WHERE t.id = NEW.trip_id
      AND coalesce((item ->> 'required')::boolean, FALSE)
      AND NOT public.checklist_answered(item ->> 'type', NEW.checklist_answers -> (item ->> 'id'));

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Required checklist items are missing: %', v_missing USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_checklist_on_checkin ON sites;
CREATE TRIGGER require_checklist_on_checkin
    BEFORE INSERT OR UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION public.require_checklist_on_checkin();
