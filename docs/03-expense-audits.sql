-- ==========================================
-- 03-expense-audits.sql
-- Migración para Tablas de Auditoría de Gastos
-- Ejecutar este archivo desde el SQL Editor de Supabase
-- ==========================================

-- 1. Tabla: Reglas de Auditoría de Gastos (expense_audit_rules)
-- Almacena los ítems normalizados, sus precios límite y frecuencias mínimas.
CREATE TABLE public.expense_audit_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL,         -- Ej: "Llantas Delanteras", "Cambio de Aceite"
    category TEXT NOT NULL,          -- Ej: "Mantenimiento", "Cambio de aceite"
    avg_price DECIMAL(12,2) NOT NULL, -- Precio base/promedio extraído históricamente
    max_allowed_price DECIMAL(12,2),  -- Umbral máximo antes de generar alerta (ej: +20% de avg_price)
    expected_frequency_days INT,      -- Días mínimos que deben pasar entre mantenimientos de este ítem
    keywords TEXT[],                  -- Palabras clave para parearlo con texto libre. ej: ['llanta', 'caucho']
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Aseguramos que no haya reglas numéricamente ambiguas o repetidas por nombre exacto
CREATE UNIQUE INDEX idx_audit_rules_name ON public.expense_audit_rules(LOWER(item_name));

-- 2. Tabla: Alertas de Auditoría (expense_alerts)
-- Almacena las infracciones detectadas al crear o editar un gasto
CREATE TABLE public.expense_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id BIGINT REFERENCES public.expenses(id) ON DELETE CASCADE,
    vehicle_plate TEXT REFERENCES public.vehicles(plate) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.expense_audit_rules(id) ON DELETE SET NULL, -- Regla infringida
    alert_type TEXT NOT NULL, -- 'PRICE_HIGH', 'FREQUENCY_HIGH'
    message TEXT NOT NULL,    -- Mensaje descriptivo para el usuario
    actual_value DECIMAL(12,2), -- Valor que disparó la alerta (ej: costo real o días pasados)
    expected_value DECIMAL(12,2), -- Valor esperado según la regla
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Índices para búsqueda rápida en el dashboard
CREATE INDEX idx_expense_alerts_is_resolved ON public.expense_alerts(is_resolved);
CREATE INDEX idx_expense_alerts_created_at ON public.expense_alerts(created_at);
CREATE INDEX idx_expense_alerts_expense_id ON public.expense_alerts(expense_id);
CREATE INDEX idx_expense_alerts_plate ON public.expense_alerts(vehicle_plate);

-- Configurar RLS (Row Level Security) básico
ALTER TABLE public.expense_audit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to expense_audit_rules" ON public.expense_audit_rules FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to expense_alerts" ON public.expense_alerts FOR ALL TO authenticated USING (true);
