-- Existing check-ins are not retroactively flagged, and stay unflagged
-- when edited (notes, or even the site's coordinates)
DO $$
BEGIN
    IF (SELECT check_flagged FROM sites WHERE id = 'a1000000-0000-0000-0000-000000000001') THEN
        RAISE EXCEPTION 'FAIL: an old check-in was flagged by the migration';
    END IF;
    IF (SELECT checkin_radius_m FROM organizations LIMIT 1) <> 150 THEN
        RAISE EXCEPTION 'FAIL: existing teams did not get the 150 m default';
    END IF;
END $$;

SET ROLE authenticated;
SELECT public.test_act_as('aaaaaaaa-0000-0000-0000-000000000001');
DO $$
DECLARE r sites%ROWTYPE;
BEGIN
    UPDATE sites SET notes = 'Edited later', latitude = -26.001
    WHERE id = 'a1000000-0000-0000-0000-000000000001' RETURNING * INTO r;
    IF r.check_flagged OR NOT r.is_checked THEN RAISE EXCEPTION 'FAIL: editing an old check-in flagged or unchecked it'; END IF;

    UPDATE sites SET is_checked = TRUE WHERE id = 'a2000000-0000-0000-0000-000000000002' RETURNING * INTO r;
    IF NOT r.check_flagged OR r.checked_at IS NULL THEN
        RAISE EXCEPTION 'FAIL: a new check-in without a position (e.g. an old app version) was not flagged and stamped';
    END IF;
    RAISE NOTICE 'PASS: 0006 leaves earlier check-ins alone and checks new ones';
END $$;
RESET ROLE;
