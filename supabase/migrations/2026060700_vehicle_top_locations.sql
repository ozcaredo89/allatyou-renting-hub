-- ============================================================
-- Migration: vehicle_top_locations + PostGIS RPC
-- Ticket: GPS-HOTSPOTS-01
-- Description: Summary table for the Top 3 parking locations
--              per vehicle, populated nightly by a Node.js cron
--              that calls the calculate_fleet_top_locations() RPC.
-- ============================================================

-- STEP 1: Ensure PostGIS extension is active (Supabase has it by default)
CREATE EXTENSION IF NOT EXISTS postgis;

-- STEP 2: Create the summary table that the frontend reads from
CREATE TABLE IF NOT EXISTS public.vehicle_top_locations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Vehicle identifier (IMEI from raw_telemetry, cross-referenced with vehicles table)
    imei        TEXT NOT NULL,

    -- Optional plate link for direct UI lookup
    plate       TEXT REFERENCES public.vehicles(plate) ON DELETE CASCADE,

    -- Rank 1 = most frequented parking spot, 3 = third most frequented
    rank_order  INTEGER NOT NULL CHECK (rank_order IN (1, 2, 3)),

    -- Centroid coordinates of the cluster (WGS84)
    latitude    NUMERIC(10, 7) NOT NULL,
    longitude   NUMERIC(10, 7) NOT NULL,

    -- Business metrics
    total_parked_hours  NUMERIC(8, 2),   -- e.g. 126.50 hours over analysis window
    last_seen_at        TIMESTAMP WITH TIME ZONE,

    -- Audit fields
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One ranking entry per vehicle, enforced at the DB level
    CONSTRAINT unique_vehicle_rank UNIQUE (imei, rank_order)
);

-- Indexes for fast frontend lookups (by imei or by plate)
CREATE INDEX IF NOT EXISTS idx_top_locations_imei  ON public.vehicle_top_locations(imei);
CREATE INDEX IF NOT EXISTS idx_top_locations_plate ON public.vehicle_top_locations(plate);

-- ============================================================
-- STEP 3: PostGIS RPC function
-- Called nightly by the Node.js cron to refresh the table.
-- Algorithm:
--   1. Pull last 30 days of telemetry where engine is OFF and speed < 2
--   2. Apply DBSCAN spatial clustering per IMEI (eps=50m, minpoints=40)
--   3. Compute centroid and stats per cluster
--   4. UPSERT Top 3 per IMEI ranked by total parked hours
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_fleet_top_locations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Temp table: clustered pings per IMEI
    -- Each row is a GPS ping annotated with its cluster_id from DBSCAN
    WITH
    filtered_pings AS (
        SELECT
            imei,
            lat,
            lng,
            report_time,
            -- Transform to EPSG:3857 (meters) for distance-accurate clustering,
            -- then cluster with eps=50 metres, requiring at least 40 pings
            -- (40 pings × 3 min/ping = 2 hours minimum dwell time)
            ST_ClusterDBSCAN(
                ST_Transform(
                    ST_SetSRID(ST_MakePoint(lng, lat), 4326),
                    3857
                ),
                eps       := 50,
                minpoints := 40
            ) OVER (PARTITION BY imei) AS cluster_id
        FROM public.raw_telemetry
        WHERE
            -- Analysis window: last 30 days only
            report_time >= NOW() - INTERVAL '30 days'
            -- Anti-noise filters: engine OFF and nearly stationary
            AND accstatus = 0
            AND speed < 2
            -- Guard against null/zero coordinates (GPS cold-start drift)
            AND lat  IS NOT NULL AND lat  != 0
            AND lng  IS NOT NULL AND lng  != 0
    ),

    -- Aggregate: one row per (imei, cluster), compute centroid and hours
    cluster_stats AS (
        SELECT
            imei,
            cluster_id,
            -- Back-project centroid to WGS84 for storage
            ST_Y(
                ST_Transform(
                    ST_Centroid(
                        ST_Collect(
                            ST_Transform(
                                ST_SetSRID(ST_MakePoint(lng, lat), 4326),
                                3857
                            )
                        )
                    ),
                    4326
                )
            ) AS centroid_lat,
            ST_X(
                ST_Transform(
                    ST_Centroid(
                        ST_Collect(
                            ST_Transform(
                                ST_SetSRID(ST_MakePoint(lng, lat), 4326),
                                3857
                            )
                        )
                    ),
                    4326
                )
            ) AS centroid_lng,
            -- Hours = ping_count × 3 minutes per ping / 60
            ROUND( (COUNT(*) * 3.0 / 60.0)::NUMERIC, 2 ) AS total_parked_hours,
            MAX(report_time) AS last_seen_at
        FROM filtered_pings
        WHERE cluster_id IS NOT NULL  -- NULL = noise points outside any cluster
        GROUP BY imei, cluster_id
    ),

    -- Rank clusters per IMEI by parking hours (most time = rank 1)
    ranked AS (
        SELECT
            cs.*,
            ROW_NUMBER() OVER (
                PARTITION BY cs.imei
                ORDER BY cs.total_parked_hours DESC
            ) AS rank_order
        FROM cluster_stats cs
    ),

    -- Keep only Top 3 per vehicle, join plate from vehicles table
    top3 AS (
        SELECT
            r.imei,
            v.plate,
            r.rank_order,
            r.centroid_lat  AS latitude,
            r.centroid_lng  AS longitude,
            r.total_parked_hours,
            r.last_seen_at
        FROM ranked r
        LEFT JOIN public.vehicles v ON v.gps_imei = r.imei
        WHERE r.rank_order <= 3
    )

    -- Atomic UPSERT: refresh all Top 3 rows for every IMEI in one statement
    INSERT INTO public.vehicle_top_locations
        (imei, plate, rank_order, latitude, longitude, total_parked_hours, last_seen_at, updated_at)
    SELECT
        imei, plate, rank_order, latitude, longitude, total_parked_hours, last_seen_at, NOW()
    FROM top3
    ON CONFLICT (imei, rank_order)
    DO UPDATE SET
        plate               = EXCLUDED.plate,
        latitude            = EXCLUDED.latitude,
        longitude           = EXCLUDED.longitude,
        total_parked_hours  = EXCLUDED.total_parked_hours,
        last_seen_at        = EXCLUDED.last_seen_at,
        updated_at          = NOW();

END;
$$;

-- Grant execution to the anon/service_role that Supabase JS client uses
GRANT EXECUTE ON FUNCTION public.calculate_fleet_top_locations() TO service_role;
