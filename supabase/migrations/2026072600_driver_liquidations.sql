-- Add terminated_at to drivers
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS terminated_at timestamp with time zone;

-- Create vehicle_assignments table for history
CREATE TABLE IF NOT EXISTS vehicle_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plate text REFERENCES vehicles(plate),
  driver_id bigint REFERENCES drivers(id),
  start_date timestamp with time zone DEFAULT now(),
  end_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Note: We assume the existing logic just writes current_driver_id in vehicles.
-- This table will now complement it.

-- Create liquidations table
CREATE TABLE IF NOT EXISTS liquidations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id bigint REFERENCES drivers(id) NOT NULL,
  plate text,
  liquidation_date timestamp with time zone DEFAULT now(),
  total_incomes numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  final_balance numeric NOT NULL DEFAULT 0,
  items_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  edited_by text,
  audit_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS and add basic policies if needed, although service role handles most
ALTER TABLE vehicle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidations ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (assuming simple setup based on service role usage mostly)
CREATE POLICY "Allow authenticated read access vehicle_assignments" ON vehicle_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert vehicle_assignments" ON vehicle_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update vehicle_assignments" ON vehicle_assignments FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access liquidations" ON liquidations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert liquidations" ON liquidations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update liquidations" ON liquidations FOR UPDATE TO authenticated USING (true);
