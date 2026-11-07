-- ===============================================================================================
-- 📊 THE ORACLE NODES - v2.0 (Data-as-a-Service)
-- Migración SQL para Supabase - Vistas de Business Intelligence (Fase 4)
-- ===============================================================================================

-- 1. Vista de Estadísticas Semanales por Nodo (Paso 4.1)
-- Agrupa los eventos logísticos válidos por semana epidemiológica/comercial.
-- Se usa para alimentar el Dashboard BI y calcular el "crecimiento" del 20% en el script de alertas.

CREATE OR REPLACE VIEW public.oracle_weekly_stats AS
SELECT 
  n.id as node_id,
  n.name as node_name,
  n.category,
  date_trunc('week', e.time_entered) as week_start,
  COUNT(e.id) as total_events,
  SUM(e.duration_minutes) as total_dwell_minutes,
  COUNT(DISTINCT e.imei) as unique_visitors
FROM public.oracle_events e
JOIN public.oracle_nodes n ON e.node_id = n.id
WHERE e.event_type = 'logistica'  -- Solo nos interesan las operaciones económicas reales
GROUP BY n.id, n.name, n.category, date_trunc('week', e.time_entered)
ORDER BY week_start DESC, total_events DESC;

-- Revocar permisos por defecto y asegurar que solo autenticados o service_role la lean
REVOKE ALL ON public.oracle_weekly_stats FROM PUBLIC;
GRANT SELECT ON public.oracle_weekly_stats TO authenticated;
GRANT SELECT ON public.oracle_weekly_stats TO service_role;
