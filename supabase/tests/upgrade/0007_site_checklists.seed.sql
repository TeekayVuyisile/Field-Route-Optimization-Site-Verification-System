-- Before 0007: a trip with one checked and one unchecked site
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', NOW());
INSERT INTO trips (id, user_id, org_id, title) VALUES
    ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
     (SELECT org_id FROM org_members WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Old trip');
INSERT INTO sites (id, trip_id, name, latitude, longitude, is_checked) VALUES
    ('a1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Checked', -26, 28, TRUE),
    ('a2000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Open', -26, 28, FALSE);
