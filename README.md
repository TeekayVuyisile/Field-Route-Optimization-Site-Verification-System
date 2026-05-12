# Field Route Optimization & Site Verification System (Pro Edition)

## Professional Field Operations & Compliance System

---

# 1. Project Overview

A professional-grade web application designed for field teams to manage complex site verification trips. The system handles the entire lifecycle from coordinate import to final evidence-based reporting.

**Primary use cases:**
* WiFi & Telecom site verification
* Infrastructure inspections (Power, Water, Road)
* Environmental site audits
* Logistics & dynamic route planning

---

# 2. Key Professional Features

| Feature | Description |
| :--- | :--- |
| **Hands-Free Navigation** | Automatic turn-by-turn voice guidance with two-stage announcements (150m heads-up & 30m action). |
| **Auto-Pilot Rerouting** | Real-time "Off-Route" detection. Detours (e.g., for lunch) trigger automatic re-optimization from the new location. |
| **Photo Evidence System** | Native camera integration with high-quality background syncing to Supabase Storage. Supports multiple photos per site. |
| **Digital Site Logbooks** | Advanced field note-taking with real-time autosave. Capture critical site data and inspection findings directly from the interactive map. |
| **Field-Grade GPS** | Advanced signal filtering to prevent "street jumping," jitter smoothing, and high-accuracy timeout recovery. |
| **Professional Reporting** | Dedicated Trip Review dashboard with completion analytics, search/filter verification logs, and CSV data export. |
| **Infinite Loop Stability** | Refactored internal engine using React Refs to prevent browser crashes during high-frequency GPS updates. |

---

# 3. Tech Stack

### **Frontend & UI**
* **React + Vite:** Lightweight, fast SPA architecture.
* **Bootstrap 5:** Responsive, professional UI components.
* **Leaflet + OpenStreetMap:** Free, high-performance interactive mapping.
* **Zustand:** Centralized global state management for trips and sites.

### **Backend & Cloud (Supabase)**
* **Auth:** Secure user sign-up and session persistence.
* **Database (PostgreSQL):** Optimized schema for Trips, Sites, and Evidence.
* **RLS (Row Level Security):** Strict data privacy ensuring users only access their own records.
* **Storage Buckets:** Managed storage for high-quality evidence photos.

### **Navigation & Data Services**
* **OpenRouteService (ORS):** Dynamic TSP optimization and turn-by-turn directions.
* **Browser Geolocation API:** Real-time tracking and Guidance Engine.
* **Web Speech API:** Professional voice guidance for hands-free operations.
* **PapaParse & SheetJS:** Robust CSV and Excel parsing for bulk site imports.

---

# 4. Advanced Navigation Logic

### **The Guidance Engine**
The system monitors the user's position against the planned polyline.
1. **Accuracy Filter:** Rejects GPS fixes with >100m error margin to prevent "jumping streets."
2. **Teleportation Detection:** Ignores improbable jumps (>500m/s) caused by hardware noise.
3. **Auto-Advancing Steps:** Detects when a maneuver point is reached and automatically advances to the next instruction.
4. **Auto-Reroute:** If the user moves >150m away from the path, a fresh optimization is called using the user's *actual* current position.

---

# 5. Coordinate Validation System

### **Region-Specific Verification (South Africa)**
* **Latitude Range:** -22 to -35
* **Longitude Range:** 16 to 33
* **Inversion Detection:** Automatically detects if Latitude and Longitude have been swapped.
* **Live Correction:** "Swap Coordinates" button available on every row for instant data fixing.

---

# 6. Database Schema

* `trips`: Stores trip metadata (User ID, Title, Timestamps).
* `sites`: Stores site data (Trip ID, Name, Coordinates, Verification Status, Notes).
* `site_images`: Links high-quality photos in Storage to specific site records.

---

# 7. Deployment & Environment

The application is optimized for deployment on **Vercel** with the following environment variables:
* `VITE_SUPABASE_URL`
* `VITE_SUPABASE_ANON_KEY`
* `VITE_ORS_API_KEY`

---

# 8. Setup Guide

## A. Local Development Setup

1.  **Clone the repository** and navigate to the `routeops` directory.
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Environment Variables:**
    Create a `.env` file in the root and add your keys:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    VITE_ORS_API_KEY=your_openrouteservice_api_key
    ```
4.  **Run Locally:**
    ```bash
    npm run dev
    ```

## B. Vercel Deployment

1.  Push your code to GitHub.
2.  Connect your repository to **Vercel**.
3.  In Vercel **Project Settings -> Environment Variables**, add the three keys mentioned above.
4.  Deploy. (Note: The `api/` directory is configured for Vercel Serverless Functions if needed).

---

# 9. Supabase Configuration (Critical)

To make the system functional, you must set up the database and storage in your Supabase dashboard.

### Step 1: Database Schema & RLS
Run this script in the **Supabase SQL Editor**:

```sql
-- 1. TRIPS TABLE
CREATE TABLE trips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. SITES TABLE
CREATE TABLE sites (
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

-- 3. SITE IMAGES TABLE
CREATE TABLE site_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users NOT NULL,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_images ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Users can manage their own trips" ON trips FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage sites in their trips" ON sites FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM trips WHERE trips.id = sites.trip_id AND trips.user_id = auth.uid()));
CREATE POLICY "Users can manage their own site images" ON site_images FOR ALL TO authenticated USING (auth.uid() = user_id);

-- GRANT PERMISSIONS
GRANT ALL ON TABLE trips TO authenticated;
GRANT ALL ON TABLE sites TO authenticated;
GRANT ALL ON TABLE site_images TO authenticated;
```

### Step 2: Storage Bucket Setup
1.  Go to **Storage** and create a new bucket named `site-photos`.
2.  Set the bucket to **Public**.
3.  Run this SQL to allow authenticated users to manage their own folders:

```sql
-- Allow users to upload to their own folder (Path: user_id/...)
CREATE POLICY "Allow individual uploads" ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'site-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to view their own files
CREATE POLICY "Allow individual views" ON storage.objects FOR SELECT TO authenticated 
USING (bucket_id = 'site-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to delete their own files
CREATE POLICY "Allow individual deletes" ON storage.objects FOR DELETE TO authenticated 
USING (bucket_id = 'site-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
```

---

# 10. Project Evolution (MVP to Pro)
This system evolved from a simple mapping tool into a professional compliance platform through rigorous field testing, implementing complex GPS smoothing, background synchronization, and hands-free voice automation.

---

*Author: Teekay Vuyisile Manale*
