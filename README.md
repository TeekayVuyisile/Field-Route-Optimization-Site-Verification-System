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

# 8. Project Evolution (MVP to Pro)
This system evolved from a simple mapping tool into a professional compliance platform through rigorous field testing, implementing complex GPS smoothing, background synchronization, and hands-free voice automation.
