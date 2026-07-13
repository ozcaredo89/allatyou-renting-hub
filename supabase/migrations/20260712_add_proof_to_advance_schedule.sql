ALTER TABLE "public"."operational_advance_schedule" 
ADD COLUMN "upload_id" bigint REFERENCES receipt_uploads(id) ON DELETE SET NULL,
ADD COLUMN "proof_url" text;
