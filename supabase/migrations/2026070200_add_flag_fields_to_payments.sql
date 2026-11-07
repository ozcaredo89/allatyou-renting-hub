-- Add flagging fields to payments table for audit review
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flag_reason TEXT NULL;

-- Index for fast querying of flagged payments
CREATE INDEX IF NOT EXISTS idx_payments_flagged ON payments(flagged_for_review) WHERE flagged_for_review = TRUE;
