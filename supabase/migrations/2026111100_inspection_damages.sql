-- Migration: Marcación interactiva 3D de daños en inspecciones vehiculares
-- Permite almacenar el arreglo de puntos de daño (coordenadas 3D, pieza/zona, etiquetas rápidas,
-- severidad, descripción y foto de evidencia por cada punto marcado en la silueta 3D).

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS damages JSONB NOT NULL DEFAULT '[]'::jsonb;
