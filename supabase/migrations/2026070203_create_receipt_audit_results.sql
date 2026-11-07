CREATE TABLE IF NOT EXISTS receipt_audit_results (
    id SERIAL PRIMARY KEY,
    payment_id BIGINT UNIQUE NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    ocr_reference_number VARCHAR(100),
    ocr_provider_name VARCHAR(255),
    ocr_receipt_date DATE,
    ocr_amount BIGINT,
    ocr_status VARCHAR(50),
    is_duplicate_reference BOOLEAN DEFAULT false,
    duplicate_of_payment_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
    is_duplicate_amount_date BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_audit_results_ocr_reference ON receipt_audit_results(ocr_reference_number);
