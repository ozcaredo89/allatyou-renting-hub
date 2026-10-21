// web/src/lib/advanceRate.ts
// Tasa y cuota de anticipos operativos (ver docs/specs/anticipos.md §2.1).
// Interés simple sobre el monto: total = monto × (1 + tasa/100), repartido en N cuotas iguales.

export const DEFAULT_ADVANCE_RATE = 15;

const fmtCOP = new Intl.NumberFormat("es-CO");

export const roundUpTo100 = (n: number) => Math.ceil((n || 0) / 100) * 100;

/** Cuota diaria sugerida para una tasa dada (redondeada hacia arriba a 100). */
export function dailyFromRate(amount: number, ratePercent: number, installments: number) {
  const a = Math.max(0, amount || 0);
  const n = Math.max(1, installments || 1);
  const r = Math.max(0, ratePercent || 0);
  return roundUpTo100(Math.round((a * (1 + r / 100)) / n) || 0);
}

/** Tasa implícita de una cuota. Puede ser negativa (la cuota no cubre el monto): no se recorta. */
export function rateFromDaily(amount: number, daily: number, installments: number) {
  const a = Math.max(1, amount || 0);
  const n = Math.max(1, installments || 1);
  return ((Math.max(0, daily || 0) * n) / a - 1) * 100;
}

export type AdvanceRateCheck = {
  total: number;
  interest: number;
  rate: number;
  /** Tasa negativa: bloquea la creación. */
  error: string | null;
  /** Tasa en 0%: se permite, pero hay que confirmar antes de crear. */
  zero: boolean;
};

export function checkAdvanceRate(amount: number, daily: number, installments: number): AdvanceRateCheck {
  const n = Math.max(1, installments || 1);
  const total = Math.max(0, daily || 0) * n;
  const interest = total - amount;
  const rate = rateFromDaily(amount, daily, n);
  const error =
    interest < 0
      ? `La cuota de $${fmtCOP.format(daily)} × ${n} = $${fmtCOP.format(total)} no cubre el monto de $${fmtCOP.format(amount)} (tasa negativa). Sube la cuota.`
      : null;
  return { total, interest, rate, error, zero: !error && Math.round(rate * 10) === 0 };
}

/** Pide confirmación si el anticipo queda sin interés. Devuelve false si el usuario quiere corregir. */
export function confirmZeroRate(amount: number, daily: number, installments: number) {
  return window.confirm(
    `⚠️ Este anticipo queda con 0% de interés.\n\n` +
      `Monto: $${fmtCOP.format(amount)}\n` +
      `${installments} cuotas de $${fmtCOP.format(daily)} = $${fmtCOP.format(daily * installments)}\n` +
      `Con ${DEFAULT_ADVANCE_RATE}% la cuota sería $${fmtCOP.format(dailyFromRate(amount, DEFAULT_ADVANCE_RATE, installments))}.\n\n` +
      `¿Crear de todas formas sin interés? (Cancelar para corregir)`
  );
}
