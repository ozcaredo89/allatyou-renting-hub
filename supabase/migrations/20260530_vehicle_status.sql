-- Add status column to vehicles table for soft deletes / lifecycle management
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'maintenance', 'sold', 'inactive'));
