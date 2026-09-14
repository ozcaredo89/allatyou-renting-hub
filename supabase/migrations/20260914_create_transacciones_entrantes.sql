-- Movimientos bancarios extraidos por bank-sync (script local de escritorio)
-- desde la Sucursal Virtual Negocios de Bancolombia, para conciliacion del
-- equipo contable.
CREATE TABLE IF NOT EXISTS transacciones_entrantes (
    id BIGSERIAL PRIMARY KEY,
    fecha DATE,
    descripcion TEXT,
    -- La referencia del banco (refnum/optionalRef) no siempre viene (p.ej.
    -- consignaciones en corresponsal bancario); cuando falta, bank-sync
    -- arma una sintetica con fecha+descripcion+sucursal+monto. Nunca es NULL.
    referencia TEXT NOT NULL,
    monto_entrada NUMERIC(14, 2) NOT NULL,
    sucursal TEXT,
    moneda TEXT,
    -- Registro original del banco (item de "history"), para auditoria y
    -- para poder corregir el mapeo de campos sin tener que re-extraer.
    raw JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- La referencia identifica el movimiento; se usa como llave de
-- deduplicacion (upsert onConflict) desde bank-sync/index.js.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transacciones_entrantes_referencia
    ON transacciones_entrantes(referencia);

CREATE INDEX IF NOT EXISTS idx_transacciones_entrantes_fecha
    ON transacciones_entrantes(fecha);
