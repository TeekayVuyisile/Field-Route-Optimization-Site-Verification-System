-- Pre-0005 state shaped like the live project: owner-only trips, no teams.
-- Applied after migrations 0001-0004, before 0005.

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'owner@example.com', NOW()),
    -- Has trips but never confirmed (e.g. created before confirmation was on)
    ('bbbbbbbb-0000-0000-0000-000000000002', 'legacy@example.com', NULL),
    -- Confirmed, no trips yet
    ('cccccccc-0000-0000-0000-000000000003', 'idle@example.com', NOW()),
    -- Unconfirmed and no trips: must NOT get a team yet
    ('dddddddd-0000-0000-0000-000000000004', 'pending@example.com', NULL);

INSERT INTO trips (id, user_id, title) VALUES
    ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Untouched'),
    ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Half done'),
    ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'All done'),
    ('22222222-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Legacy trip');

INSERT INTO sites (trip_id, name, latitude, longitude, is_checked) VALUES
    ('11111111-0000-0000-0000-000000000001', 'u1', -26, 28, false),
    ('11111111-0000-0000-0000-000000000002', 'h1', -26, 28, true),
    ('11111111-0000-0000-0000-000000000002', 'h2', -26, 28, false),
    ('11111111-0000-0000-0000-000000000003', 'd1', -26, 28, true),
    ('22222222-0000-0000-0000-000000000001', 'l1', -26, 28, false);
