-- Add payment due date (20 calendar days after retirement for SIMIT validation) and payment proof fields to liquidations
ALTER TABLE liquidations
  ADD COLUMN IF NOT EXISTS payment_due_date date,
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS payment_notes text;

-- Backfill payment_due_date for existing liquidations (liquidation_date + 20 calendar days)
UPDATE liquidations
SET payment_due_date = ((COALESCE(liquidation_date, created_at) AT TIME ZONE 'America/Bogota')::date + INTERVAL '20 days')::date
WHERE payment_due_date IS NULL;
