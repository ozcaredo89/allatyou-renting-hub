-- Add UNIQUE constraint to reference_number to strictly prevent duplicates
-- We use a partial index because we only care about uniqueness when reference_number is not null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reference_number_unique 
ON payments(reference_number) 
WHERE reference_number IS NOT NULL;
