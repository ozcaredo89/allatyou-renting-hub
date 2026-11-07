-- Recargo por pago tardío (docs/specs/pagos.md §3).
-- La hora de la transferencia la lee el OCR del comprobante; el recargo se registra como deuda
-- aparte del canon: late_fee_amount = recargo causado ese día, late_fee_paid = lo abonado con
-- el excedente del pago sobre canon + cuota de anticipo. late_fee_paid es una parte de
-- delivery_amount (no se descuenta de ahí), así las vistas de utilidad no cambian.

ALTER TABLE public.receipt_uploads ADD COLUMN IF NOT EXISTS receipt_time time;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS receipt_time time;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS late_fee_amount integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS late_fee_paid integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.receipt_uploads.receipt_time IS
  'Hora de la transferencia leída por OCR (hora Colombia).';
COMMENT ON COLUMN public.payments.receipt_time IS
  'Hora de la transferencia según el comprobante (copiada de receipt_uploads).';
COMMENT ON COLUMN public.payments.late_fee_amount IS
  'Recargo por pago tardío causado para payment_date: 0, 5000, 10000 o 15000. NULL = no se pudo calcular (el comprobante no tiene fecha u hora legible). 0 en leasing.';
COMMENT ON COLUMN public.payments.late_fee_paid IS
  'Parte del recargo pagada con el excedente sobre canon + cuota de anticipo. Está incluida en delivery_amount (no se suma aparte); el saldo (late_fee_amount - late_fee_paid) queda debiendo.';
