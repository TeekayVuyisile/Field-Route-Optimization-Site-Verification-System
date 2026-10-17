-- Initial schema: trips + sites with ownership-based RLS.
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), so it is safe to run on
-- the existing live project. Source: the previously untracked supabase_fix.sql.
--
-- NOT YET INCLUDED: the site_images table and the site-photos storage bucket
-- policies. They exist in the live project but were never saved as SQL; they
-- will be added as 0002 once exported from the Supabase dashboard.


-- Create Trips Table if not exists
CREATE TABLE IF NOT EXISTS trips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Sites Table if not exists
CREATE TABLE IF NOT EXISTS sites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_checked BOOLEAN DEFAULT FALSE,
    notes TEXT,
    order_index INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Explicitly Grant Permissions to Authenticated Users
-- This ensures the role itself has access to the table before RLS is checked
GRANT ALL ON TABLE trips TO authenticated;
GRANT ALL ON TABLE sites TO authenticated;
GRANT ALL ON TABLE trips TO service_role;
GRANT ALL ON TABLE sites TO service_role;

-- 3. Enable RLS
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- 4. Re-create Policies with explicit TO authenticated
DROP POLICY IF EXISTS "Users can create their own trips" ON trips;
CREATE POLICY "Users can create their own trips" 
ON trips FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own trips" ON trips;
CREATE POLICY "Users can view their own trips" 
ON trips FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own trips" ON trips;
CREATE POLICY "Users can update their own trips" 
ON trips FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own trips" ON trips;
CREATE POLICY "Users can delete their own trips" 
ON trips FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Sites Policies
DROP POLICY IF EXISTS "Users can manage sites in their own trips" ON sites;
CREATE POLICY "Users can manage sites in their own trips" 
ON sites FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM trips 
        WHERE trips.id = sites.trip_id 
        AND trips.user_id = auth.uid()
    )
);
