-- Migration to create receipt_uploads table for security and tracking
CREATE TABLE IF NOT EXISTS receipt_uploads (
    id SERIAL PRIMARY KEY,
    r2_key VARCHAR(255),
    url TEXT NOT NULL,
    reference_number VARCHAR(100),
    provider_name VARCHAR(255),
    receipt_date DATE,
    amount BIGINT,
    ocr_status VARCHAR(50) DEFAULT 'unverified',
    linked_payment_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for fast lookups
CREATE INDEX IF NOT EXISTS idx_receipt_uploads_linked_payment ON receipt_uploads(linked_payment_id);
CREATE INDEX IF NOT EXISTS idx_receipt_uploads_created_at ON receipt_uploads(created_at);
