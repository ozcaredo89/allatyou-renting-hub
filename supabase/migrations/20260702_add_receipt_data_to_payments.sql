-- Migration to add receipt validation fields and anomaly status
ALTER TABLE payments 
ADD COLUMN reference_number VARCHAR(100),
ADD COLUMN provider_name VARCHAR(255),
ADD COLUMN receipt_date DATE,
ADD COLUMN receipt_status VARCHAR(50) DEFAULT 'unverified';

-- Index for exact reference number match (to block identical hard duplicates)
CREATE INDEX IF NOT EXISTS idx_payments_reference_number ON payments(reference_number);

-- Index for amount and date combinations (to flag suspicious identical amounts on the same day)
CREATE INDEX IF NOT EXISTS idx_payments_amount_date ON payments(amount, receipt_date);
