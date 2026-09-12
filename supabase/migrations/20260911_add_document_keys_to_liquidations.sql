-- Add document S3 keys and metadata to liquidations
ALTER TABLE liquidations 
  ADD COLUMN IF NOT EXISTS pdf_s3_key text,
  ADD COLUMN IF NOT EXISTS docx_s3_key text,
  ADD COLUMN IF NOT EXISTS document_metadata jsonb DEFAULT '{}'::jsonb;
