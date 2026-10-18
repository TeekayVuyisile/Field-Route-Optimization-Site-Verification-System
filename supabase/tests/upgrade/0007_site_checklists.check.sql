-- Existing trips have no checklist and existing sites start with no answers;
-- checking in carries on exactly as before
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM trips WHERE checklist IS NOT NULL) THEN RAISE EXCEPTION 'FAIL: an old trip got a checklist'; END IF;
    IF EXISTS (SELECT 1 FROM sites WHERE checklist_answers <> '{}'::jsonb) THEN RAISE EXCEPTION 'FAIL: old sites got answers'; END IF;
END $$;

SET ROLE authenticated;
SELECT public.test_act_as('aaaaaaaa-0000-0000-0000-000000000001');
DO $$
BEGIN
    UPDATE sites SET is_checked = TRUE WHERE id = 'a2000000-0000-0000-0000-000000000002';
    UPDATE sites SET is_checked = FALSE WHERE id = 'a1000000-0000-0000-0000-000000000001';
    RAISE NOTICE 'PASS: 0007 leaves trips without a checklist working as before';
END $$;
RESET ROLE;
