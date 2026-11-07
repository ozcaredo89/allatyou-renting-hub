-- Add structured inconsistency data to payments (duplicates, amount mismatches)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS flag_details JSONB NULL;
COMMENT ON COLUMN payments.flag_details IS 'Detalles estructurados de inconsistencias: duplicate_payment_ids, match_type, matched_reference, db_amount, ocr_amount, difference.';
