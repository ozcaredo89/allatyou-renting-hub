-- =============================================================================
-- Migration: Add pending/superseded to leasing_contracts, reserved to vehicles
-- =============================================================================

-- 1. Actualizar 'status' en leasing_contracts
-- El check original era: (status IN ('active', 'closed', 'default'))
ALTER TABLE public.leasing_contracts DROP CONSTRAINT IF EXISTS leasing_contracts_status_check;

ALTER TABLE public.leasing_contracts
  ADD CONSTRAINT leasing_contracts_status_check
  CHECK (status IN ('pending', 'active', 'closed', 'default', 'superseded', 'cancelled'));

-- Modificar el default a 'pending'
ALTER TABLE public.leasing_contracts ALTER COLUMN status SET DEFAULT 'pending';

-- Agregar campo de cuota diaria (capital + interes) que fue cotizado
ALTER TABLE public.leasing_contracts ADD COLUMN IF NOT EXISTS daily_capital_interest NUMERIC NOT NULL DEFAULT 0;

-- 2. Añadir campos para el contrato firmado
ALTER TABLE public.leasing_contracts
  ADD COLUMN IF NOT EXISTS signed_contract_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- 3. Actualizar 'status' en vehicles
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;

-- NOTA: 'active' en vehicles.status significa "Disponible / Operativo", NO tiene
-- relación con leasing_contracts.status = 'active'. Nomenclatura histórica,
-- pendiente de unificación en un refactor futuro (TODO).
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_status_check
  CHECK (status IN ('active', 'maintenance', 'inactive', 'leasing', 'sold', 'reserved'));

COMMIT;
