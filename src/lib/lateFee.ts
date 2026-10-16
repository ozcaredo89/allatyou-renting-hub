// src/lib/lateFee.ts
// Recargo por pago tardío (docs/specs/pagos.md §3).
// El canon de cada día se paga antes de las 4:00 PM según la hora de la transferencia.
// Desde las 4 PM: $5.000, +$5.000 por cada hora adicional, máximo $15.000 por día.
// No aplica a leasing (lo decide quien llama).

export const LATE_FEE_START_HOUR = 16;
export const LATE_FEE_STEP = 5000;
export const LATE_FEE_MAX = 15000;

export type LateFeeReason =
  | "ON_TIME"        // transferencia antes de las 4 PM del día pagado
  | "EARLY"          // transferencia de un día anterior al día pagado (pago adelantado)
  | "LATE_SAME_DAY"  // transferencia el mismo día desde las 4 PM
  | "LATE_DAY"       // transferencia de un día posterior: el día no se pagó → recargo máximo
  | "NO_RECEIPT_DATE"
  | "NO_RECEIPT_TIME";

export interface LateFeeResult {
  /** null = no se pudo calcular (falta fecha u hora en el comprobante). */
  amount: number | null;
  reason: LateFeeReason;
}

/**
 * Calcula el recargo causado para el día `paymentDate` (YYYY-MM-DD) con la fecha y hora
 * de la transferencia del comprobante (`receiptTime` en "HH:MM" o "HH:MM:SS").
 */
export function computeLateFee(paymentDate: string, receiptDate: string | null, receiptTime: string | null): LateFeeResult {
  if (!receiptDate) return { amount: null, reason: "NO_RECEIPT_DATE" };
  if (receiptDate < paymentDate) return { amount: 0, reason: "EARLY" };
  if (receiptDate > paymentDate) return { amount: LATE_FEE_MAX, reason: "LATE_DAY" };

  const m = receiptTime ? String(receiptTime).match(/^(\d{1,2}):(\d{2})/) : null;
  if (!m) return { amount: null, reason: "NO_RECEIPT_TIME" };
  const hour = Number(m[1]);
  if (hour < LATE_FEE_START_HOUR) return { amount: 0, reason: "ON_TIME" };
  const amount = Math.min(LATE_FEE_MAX, (hour - LATE_FEE_START_HOUR + 1) * LATE_FEE_STEP);
  return { amount, reason: "LATE_SAME_DAY" };
}

/**
 * Parte del recargo que se paga con este pago: el excedente sobre canon + cuota de anticipo,
 * hasta el valor del recargo. Nunca supera lo que hay en delivery (de ahí se descuenta).
 */
export function lateFeePaidFromExcess(params: {
  lateFee: number | null;
  amount: number;
  canon: number;
  credit: number;
  delivery: number;
}): number {
  const fee = params.lateFee ?? 0;
  if (fee <= 0) return 0;
  const excess = Math.max(0, params.amount - params.canon - params.credit);
  return Math.max(0, Math.min(fee, excess, params.delivery));
}
