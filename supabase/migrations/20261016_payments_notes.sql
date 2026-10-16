-- Nota libre en pagos: explica pagos atípicos (montos < tarifa, días en mantenimiento, ajustes manuales).
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.payments.notes IS
  'Nota administrativa del pago (motivo de monto atípico, día en mantenimiento, ajuste de conciliación).';
