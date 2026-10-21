// src/lib/advanceRate.ts
// Validación de tasa/cuota de anticipos operativos (ver docs/specs/anticipos.md §2.1).

/** Devuelve un mensaje de error si la tasa es negativa o la cuota no cubre el monto; null si es válida. */
export function advanceRateError(amount: number, dailyInstallment: number, installments: number, ratePercent: number): string | null {
  if (!Number.isFinite(ratePercent) || ratePercent < 0) return "rate_percent no puede ser negativa";
  if (dailyInstallment * installments < amount) {
    return `La cuota (${dailyInstallment} × ${installments} = ${dailyInstallment * installments}) no cubre el monto ${amount}: tasa negativa`;
  }
  return null;
}
