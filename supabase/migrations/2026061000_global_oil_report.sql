-- ============================================================
-- Migration: get_global_oil_stats RPC (v2 — session-aware)
-- Ticket: OIL-REPORT-GLOBAL-02
-- Supersedes: 20260610_global_oil_report.sql
--
-- KEY FIX: A single physical oil change visit typically generates
-- multiple expense rows (e.g. "Aceite 10W-40" + "Filtro de aceite"),
-- all with category = 'Cambio de aceite' for the same plate on the
-- same date. The previous version counted each row as a separate
-- change, inflating the numbers.
--
-- This version collapses those rows into a single "session"
-- by grouping on (plate, date) BEFORE counting. One session =
-- one physical oil change for one vehicle on one day.
--
-- Additionally, each monthly bucket now carries a full sessions[]
-- array so the frontend can render a drill-down detail view.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_global_oil_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total         INTEGER;
  v_monthly_data  JSON;
  v_result        JSON;

  -- Always show exactly 12 calendar-month buckets (current month included)
  v_window_start  DATE := DATE_TRUNC('month', NOW()) - INTERVAL '11 months';
BEGIN

  -- ── STEP 1: Resolve distinct service sessions ────────────────────────────
  --
  -- A "session" is defined as: one plate + one date with at least one
  -- expense row whose category = 'Cambio de aceite'.
  -- All line items (aceite, filtro, etc.) belonging to that session are
  -- collapsed into a JSON array called `items`.
  --
  -- We join through expense_vehicles so we get the plate even when a single
  -- expense row covers multiple vehicles (split-cost scenario).

  WITH

  -- 1a. Flatten: one row per (expense_id, plate) for oil-change expenses
  oil_lines AS (
    SELECT
      e.date::DATE                                    AS service_date,
      ev.plate,
      e.item,
      ev.share_amount                                 AS amount
    FROM   public.expenses      e
    JOIN   public.expense_vehicles ev ON ev.expense_id = e.id
    WHERE  e.category  = 'Cambio de aceite'
      AND  e.date::DATE >= v_window_start
  ),

  -- 1b. Collapse: one row per (plate, date) = one physical oil change session
  --     Items are aggregated into a JSON array, sorted by item name
  sessions AS (
    SELECT
      plate,
      service_date,
      DATE_TRUNC('month', service_date)::DATE          AS month_start,
      JSON_AGG(
        JSON_BUILD_OBJECT('item', item, 'amount', amount)
        ORDER BY item
      )                                                AS items,
      SUM(amount)                                      AS session_total
    FROM   oil_lines
    GROUP  BY plate, service_date
  ),

  -- ── STEP 2: Build the 12-month spine ────────────────────────────────────
  month_series AS (
    SELECT generate_series(
      v_window_start,
      DATE_TRUNC('month', NOW()),
      INTERVAL '1 month'
    )::DATE AS month_start
  ),

  -- ── STEP 3: Aggregate sessions per month ────────────────────────────────
  monthly_agg AS (
    SELECT
      ms.month_start,
      -- Count of distinct sessions (= real oil changes), NOT expense rows
      COUNT(s.plate)::INTEGER                          AS session_count,
      -- Full session detail for the drill-down UI
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'plate',         s.plate,
            'date',          TO_CHAR(s.service_date, 'YYYY-MM-DD'),
            'items',         s.items,
            'session_total', s.session_total
          )
          ORDER BY s.service_date DESC, s.plate ASC
        ) FILTER (WHERE s.plate IS NOT NULL),
        '[]'::JSON
      )                                                AS sessions
    FROM  month_series ms
    LEFT  JOIN sessions s ON s.month_start = ms.month_start
    GROUP BY ms.month_start
  )

  -- ── STEP 4: Pack monthly data as JSON array ──────────────────────────────
  SELECT JSON_AGG(
    JSON_BUILD_OBJECT(
      'month',       TO_CHAR(ma.month_start, 'YYYY-MM'),
      'month_label', TO_CHAR(ma.month_start, 'Mon'),
      'year',        EXTRACT(YEAR FROM ma.month_start)::INTEGER,
      'count',       ma.session_count,
      'sessions',    ma.sessions
    )
    ORDER BY ma.month_start ASC
  )
  INTO v_monthly_data
  FROM monthly_agg ma;

  -- ── STEP 5: Grand total = sum of session counts (not raw rows) ───────────
  SELECT COALESCE(SUM(session_count), 0)::INTEGER
  INTO   v_total
  FROM (
    SELECT COUNT(*)::INTEGER AS session_count
    FROM   sessions
  ) t;

  -- ── STEP 6: Return ────────────────────────────────────────────────────────
  v_result := JSON_BUILD_OBJECT(
    'total_changes',  v_total,
    'monthly_data',   COALESCE(v_monthly_data, '[]'::JSON),
    'generated_at',   NOW()
  );

  RETURN v_result;
END;
$$;

-- Grant execution rights to the service_role used by the Supabase JS client
GRANT EXECUTE ON FUNCTION public.get_global_oil_stats() TO service_role;
