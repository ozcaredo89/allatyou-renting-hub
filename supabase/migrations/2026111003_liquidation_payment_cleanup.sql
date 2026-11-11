-- Issue #31 (seguimiento de #23): limpieza de datos de pago de liquidaciones.

-- 1. Rescatar a las columnas dedicadas cualquier dato de pago que haya quedado solo en document_metadata
UPDATE liquidations
SET
  payment_due_date  = COALESCE(payment_due_date, NULLIF(document_metadata->>'payment_due_date', '')::date),
  payment_proof_url = COALESCE(payment_proof_url, NULLIF(document_metadata->>'payment_proof_url', '')),
  paid_at           = COALESCE(paid_at, NULLIF(document_metadata->>'paid_at', '')::timestamptz),
  payment_notes     = COALESCE(payment_notes, NULLIF(document_metadata->>'payment_notes', ''))
WHERE document_metadata ?| array['payment_due_date', 'payment_proof_url', 'paid_at', 'payment_notes'];

-- 2. Quitar los duplicados de document_metadata (las columnas son la única fuente)
UPDATE liquidations
SET document_metadata = document_metadata - 'payment_due_date' - 'payment_proof_url' - 'paid_at' - 'payment_notes'
WHERE document_metadata ?| array['payment_due_date', 'payment_proof_url', 'paid_at', 'payment_notes'];

-- 3. Liquidaciones históricas (vencidas antes de que existiera el control de pagos) se dan por pagadas,
--    para que el resumen diario no las reporte como VENCIDAS.
UPDATE liquidations
SET
  paid_at = (payment_due_date::timestamp + INTERVAL '12 hours') AT TIME ZONE 'America/Bogota',
  payment_notes = COALESCE(payment_notes, 'Histórica: pagada antes del control de pagos (#31)')
WHERE paid_at IS NULL
  AND payment_proof_url IS NULL
  AND payment_due_date < DATE '2026-11-10';
