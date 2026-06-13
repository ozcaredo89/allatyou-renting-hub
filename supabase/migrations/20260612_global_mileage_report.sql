-- =============================================================================
-- Migration: 20260612_global_mileage_report.sql
-- Purpose  : RPC that aggregates per-vehicle mileage across four temporal
--            dimensions (daily, weekly, monthly, yearly) from vehicle_mileage_logs.
--
-- Semantic contract of vehicle_mileage_logs:
--   source = 'protrack_api'  → mileage_km stores INCREMENTAL daily delta (GPS)
--   source = 'manual'        → mileage_km stores ABSOLUTE odometer reading
--
-- True odometer formula:
--   current_odometer = latest_manual_odometer + SUM(gps_km recorded after it)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_global_mileage_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    tz TEXT := 'America/Bogota';
    now_local TIMESTAMPTZ;
    day_start TIMESTAMPTZ;
    week_start TIMESTAMPTZ;
    month_start TIMESTAMPTZ;
    year_start TIMESTAMPTZ;
    result jsonb;
BEGIN
    -- Anchor all temporal boundaries to Colombia local time
    now_local   := NOW() AT TIME ZONE tz;
    day_start   := DATE_TRUNC('day',   now_local) AT TIME ZONE tz;
    week_start  := DATE_TRUNC('week',  now_local) AT TIME ZONE tz;
    month_start := DATE_TRUNC('month', now_local) AT TIME ZONE tz;
    year_start  := DATE_TRUNC('year',  now_local) AT TIME ZONE tz;

    WITH

    -- ── Step 1: Latest manual odometer reading per vehicle ────────────────────
    -- DISTINCT ON guarantees we get exactly one row per plate (the most recent).
    latest_manual AS (
        SELECT DISTINCT ON (plate)
            plate,
            mileage_km   AS manual_km,
            recorded_at  AS manual_at
        FROM public.vehicle_mileage_logs
        WHERE source = 'manual'
        ORDER BY plate, recorded_at DESC
    ),

    -- ── Step 2: Sum of GPS incremental km recorded AFTER the latest manual ────
    -- Vehicles without any manual entry sum ALL their GPS logs.
    gps_since_manual AS (
        SELECT
            l.plate,
            COALESCE(SUM(l.mileage_km), 0) AS gps_sum
        FROM public.vehicle_mileage_logs l
        LEFT JOIN latest_manual m ON l.plate = m.plate
        WHERE l.source = 'protrack_api'
          AND (m.manual_at IS NULL OR l.recorded_at > m.manual_at)
        GROUP BY l.plate
    ),

    -- ── Step 3: Temporal utilization buckets per vehicle (GPS only) ───────────
    -- Each filter window uses a parameterised boundary computed above.
    temporal AS (
        SELECT
            plate,
            COALESCE(SUM(mileage_km) FILTER (
                WHERE source = 'protrack_api'
                  AND recorded_at >= day_start
            ), 0)   AS daily_km,

            COALESCE(SUM(mileage_km) FILTER (
                WHERE source = 'protrack_api'
                  AND recorded_at >= week_start
            ), 0)   AS weekly_km,

            COALESCE(SUM(mileage_km) FILTER (
                WHERE source = 'protrack_api'
                  AND recorded_at >= month_start
            ), 0)   AS monthly_km,

            COALESCE(SUM(mileage_km) FILTER (
                WHERE source = 'protrack_api'
                  AND recorded_at >= year_start
            ), 0)   AS yearly_km
        FROM public.vehicle_mileage_logs
        GROUP BY plate
    )

    -- ── Step 4: Join everything with the vehicles master table ─────────────────
    SELECT
        jsonb_agg(
            jsonb_build_object(
                'plate',            v.plate,
                'brand',            v.brand,
                'line',             v.line,
                'model_year',       v.model_year,
                'status',           v.status,
                'has_gps',          (v.gps_imei IS NOT NULL),
                -- True current odometer: latest manual + all GPS km since then
                'current_odometer', ROUND(
                    COALESCE(m.manual_km, 0) + COALESCE(gsm.gps_sum, 0)
                , 2),
                -- Temporal utilization (0 for manual-only vehicles)
                'daily_km',   CASE WHEN v.gps_imei IS NOT NULL THEN ROUND(COALESCE(t.daily_km,   0), 2) ELSE 0 END,
                'weekly_km',  CASE WHEN v.gps_imei IS NOT NULL THEN ROUND(COALESCE(t.weekly_km,  0), 2) ELSE 0 END,
                'monthly_km', CASE WHEN v.gps_imei IS NOT NULL THEN ROUND(COALESCE(t.monthly_km, 0), 2) ELSE 0 END,
                'yearly_km',  CASE WHEN v.gps_imei IS NOT NULL THEN ROUND(COALESCE(t.yearly_km,  0), 2) ELSE 0 END
            )
            ORDER BY v.plate ASC
        ) INTO result
    FROM public.vehicles v
    LEFT JOIN temporal       t   ON v.plate = t.plate
    LEFT JOIN latest_manual  m   ON v.plate = m.plate
    LEFT JOIN gps_since_manual gsm ON v.plate = gsm.plate
    WHERE v.status IN ('active', 'maintenance');

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Grant execute permission to the service role used by the backend
GRANT EXECUTE ON FUNCTION public.get_global_mileage_stats() TO service_role;

-- ── Optional composite index to accelerate temporal filter scans ──────────────
-- Covers the WHERE source = 'protrack_api' AND recorded_at >= <boundary> pattern
-- that is repeated four times in Step 3 above.
CREATE INDEX IF NOT EXISTS idx_mileage_plate_source_date
    ON public.vehicle_mileage_logs (plate, source, recorded_at DESC);
