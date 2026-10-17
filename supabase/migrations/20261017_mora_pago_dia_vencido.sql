-- =============================================================================
-- Mora con pago a día vencido y gracia hasta las 4 PM (pagos.md §1).
--
-- Los conductores pagan el día D durante el día D+1, hasta las 4 PM (cuando empieza
-- el recargo). Por eso el día D solo es mora desde D+1 16:00 (hora Colombia).
--
--   mora_cutoff_date() = último día que ya cuenta como mora
--     hora Colombia >= 16:00 -> hoy - 1
--     hora Colombia <  16:00 -> hoy - 2
--
-- La vista usa ese corte (antes usaba "hoy") y es mora con 1 día o más
-- (antes >= 2, que era un parche para esta misma gracia).
-- Mismas columnas y orden que la vista anterior.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mora_cutoff_date()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT ((now() AT TIME ZONE 'America/Bogota')::date
    - CASE WHEN EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Bogota')) >= 16 THEN 1 ELSE 2 END)::date;
$$;

CREATE OR REPLACE VIEW public.vehicle_last_payment
WITH (security_invoker = true) AS
SELECT
  v.plate,
  v.owner_name,
  lp.payment_date,
  lp.amount,
  COALESCE(lp.payment_date, v.created_at::date) AS ref_date,
  (now() AT TIME ZONE 'America/Bogota'::text)::date AS today_bogota,

  -- Días pagables vencidos (con la gracia hasta las 4 PM del día siguiente)
  public.get_payable_days(
    v.plate,
    COALESCE(lp.payment_date, v.created_at::date),
    public.mora_cutoff_date()
  ) AS days_since,

  -- Es mora si ya tiene al menos un día vencido
  public.get_payable_days(
    v.plate,
    COALESCE(lp.payment_date, v.created_at::date),
    public.mora_cutoff_date()
  ) >= 1 AS is_overdue,

  lp.installment_number,

  CASE
    WHEN lp.batch_id IS NOT NULL THEN (
      SELECT p2.proof_url
      FROM payments p2
      WHERE p2.batch_id = lp.batch_id
        AND p2.proof_url IS NOT NULL
      ORDER BY p2.batch_index ASC
      LIMIT 1
    )
    ELSE lp.proof_url
  END AS proof_url

FROM
  vehicles v
  LEFT JOIN LATERAL (
    SELECT
      p.payment_date,
      p.amount,
      p.installment_number,
      p.proof_url,
      p.batch_id
    FROM
      payments p
    WHERE
      p.plate = v.plate
    ORDER BY
      p.payment_date DESC,
      p.created_at DESC
    LIMIT 1
  ) lp ON true;
