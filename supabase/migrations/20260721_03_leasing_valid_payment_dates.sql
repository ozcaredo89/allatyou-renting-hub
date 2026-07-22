-- Migration: Add valid_payment_dates to leasing_contracts
ALTER TABLE "public"."leasing_contracts"
ADD COLUMN "valid_payment_dates" jsonb DEFAULT '[]'::jsonb;
