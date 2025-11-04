// src/lib/amort.ts
export type ScheduleItem = {
  installment_no: number;
  due_date: string;           // YYYY-MM-DD
  installment_amount: number; // cuota
  interest_amount: number;
  principal_amount: number;
};

function parseISODate(isoDate: string): Date {
  // Espera YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error(`Invalid ISO date: ${isoDate}`);
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Validación de overflow (31→mes corto)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Invalid calendar date: ${isoDate}`);
  }
  return dt;
}

function addMonthsUTC(isoDate: string, months: number): string {
  const dt = parseISODate(isoDate);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const d = dt.getUTCDate();

  // crear una fecha base y avanzar meses
  const base = new Date(Date.UTC(y, m, 1));
  base.setUTCMonth(m + months);
  // mantener día (clamp al último del mes)
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  base.setUTCDate(day);

  return base.toISOString().slice(0, 10);
}

export type BuildScheduleOptions = {
  /** 'total' = tasa total del crédito (flat). 'monthly' = tasa mensual compuesta (francés). */
  rateType: 'total' | 'monthly';
  /** para 'total': ej. 15 => 15% total sobre el principal */
  totalRatePercent?: number;
  /** para 'monthly': ej. 3 => 3% mensual */
  monthlyRatePercent?: number;
  /** primera cuota el mismo día del startDate (false => al mes siguiente) */
  firstDueAtStart?: boolean;
};

/**
 * Calcula cronograma con cuota fija.
 * - rateType='total': total a pagar = P*(1+r_total). Interés total se reparte parejo (ajuste última cuota).
 * - rateType='monthly': francés clásico con r mensual.
 */
export function buildFixedSchedule(
  principalCOP: number,
  n: number,
  startDate: string,
  opts: BuildScheduleOptions
): ScheduleItem[] {
  if (!(principalCOP > 0)) throw new Error('principal > 0 required');
  if (!(n >= 1)) throw new Error('installments >= 1 required');

  const P = Math.round(principalCOP);
  const firstOffset = opts.firstDueAtStart ? 0 : 1; // 0: primera cuota en startDate; 1: al mes siguiente

  if (opts.rateType === 'total') {
    const rt = (opts.totalRatePercent ?? 0) / 100; // p.ej., 0.15
    const totalToPayFloat = P * (1 + rt);
    const cuotaBase = Math.floor(totalToPayFloat / n); // repartir parejo
    const remainder = Math.round(totalToPayFloat - cuotaBase * n); // para ajustar en la última

    const interestTotal = Math.round(P * rt);
    const interestBase = Math.floor(interestTotal / n);
    const interestRemainder = interestTotal - interestBase * n;

    let remainingPrincipal = P;
    const out: ScheduleItem[] = [];

    for (let k = 1; k <= n; k++) {
      const due_date = addMonthsUTC(startDate, firstOffset + (k - 1));
      const interest = interestBase + (k === n ? interestRemainder : 0);
      let installment_amount = cuotaBase + (k === n ? remainder : 0);
      let principal = installment_amount - interest;
      if (k === n) principal = remainingPrincipal; // cerrar saldo exactamente
      installment_amount = principal + interest;

      out.push({
        installment_no: k,
        due_date,
        installment_amount,
        interest_amount: interest,
        principal_amount: principal,
      });

      remainingPrincipal = Math.max(0, remainingPrincipal - principal);
    }
    return out;
  }

  // rateType === 'monthly' → francés clásico
  const i = (opts.monthlyRatePercent ?? 0) / 100; // tasa por periodo (mes)
  const cuotaFloat = i === 0 ? (P / n) : (P * i) / (1 - Math.pow(1 + i, -n));
  const cuota = Math.round(cuotaFloat);

  let balance = P;
  const out: ScheduleItem[] = [];
  for (let k = 1; k <= n; k++) {
    const due_date = addMonthsUTC(startDate, firstOffset + (k - 1));
    const interest = Math.round(balance * i);
    let principal = cuota - interest;
    if (k === n) principal = balance; // cerrar saldo

    out.push({
      installment_no: k,
      due_date,
      installment_amount: principal + interest,
      interest_amount: interest,
      principal_amount: principal,
    });

    balance = Math.max(0, balance - principal);
  }
  return out;
}
