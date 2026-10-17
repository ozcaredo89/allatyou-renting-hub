// Días pendientes de una placa ("Resolver días en mora", pagos.md §6).
// Lista cada día desde el último payment_date hasta hoy (hora Colombia) con:
// - si es pagable (Pico y Placa / calendario de no pago),
// - quién tenía el carro ese día según vehicle_assignments,
// - si cuenta como mora. Mismo criterio que get_payable_days
//   (supabase/migrations/20261017_mora_sin_conductor.sql): un día sin conductor asignado no es mora.
import { supabase } from "./supabase";
import { getAmortizationDates } from "./noPay";
import { bogotaDay } from "./taller";

/** Máximo de días que se listan (desde el más antiguo) */
export const MAX_PENDING_DAYS = 120;

export type DayDriver = {
  driver_id: number;
  driver_name: string | null;
  /** YYYY-MM-DD hora Colombia */
  start: string;
  end: string | null;
};

export type PendingDay = {
  date: string;
  /** false = Pico y Placa o día de no pago del calendario */
  payable: boolean;
  /** Conductores con el carro ese día (dos en el día de entrega) */
  drivers: DayDriver[];
  /** Conductor que debe el día: el que tenía el carro; en el día de entrega, el que lo entregó */
  responsible: DayDriver | null;
  /** true = pagable y con conductor asignado → cuenta en la mora */
  counts_as_mora: boolean;
};

export type PendingDaysResult = {
  plate: string;
  last_payment_date: string | null;
  ref_date: string;
  today: string;
  /** false = la placa no tiene historial en vehicle_assignments; se usa current_driver_id */
  has_assignment_history: boolean;
  days: PendingDay[];
  truncated: boolean;
};

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function listPendingDays(plate: string): Promise<PendingDaysResult> {
  const today = bogotaDay(new Date());

  // Igual que vehicle_last_payment: último pago de la placa (cualquier estado) o fecha de creación
  const [{ data: lastPayment }, { data: vehicle }] = await Promise.all([
    supabase
      .from("payments")
      .select("payment_date")
      .eq("plate", plate)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("vehicles").select("created_at, current_driver_id").eq("plate", plate).maybeSingle(),
  ]);

  const lastPaymentDate: string | null = lastPayment?.payment_date ?? null;
  const refDate = lastPaymentDate || (vehicle?.created_at ? String(vehicle.created_at).slice(0, 10) : today);

  const all: string[] = [];
  for (let d = addDays(refDate, 1); d <= today; d = addDays(d, 1)) all.push(d);
  const truncated = all.length > MAX_PENDING_DAYS;
  const range = all.slice(0, MAX_PENDING_DAYS);

  const base: PendingDaysResult = {
    plate,
    last_payment_date: lastPaymentDate,
    ref_date: refDate,
    today,
    has_assignment_history: false,
    days: [],
    truncated,
  };
  if (!range.length) return base;

  const from = range[0]!;
  const to = range[range.length - 1]!;

  // Días pagables del rango (genera tantas fechas válidas como días tiene el rango, así cubre todo)
  const { dates } = await getAmortizationDates(plate, from, range.length);
  const payable = new Set(dates.filter((d) => d <= to));

  // Asignaciones de la placa
  const { data: assignments } = await supabase
    .from("vehicle_assignments")
    .select("driver_id, start_date, end_date")
    .eq("plate", plate)
    .not("driver_id", "is", null)
    .order("start_date", { ascending: true });

  const hasHistory = (assignments?.length ?? 0) > 0;
  let rows: { driver_id: number; start: string; end: string | null }[] = (assignments ?? []).map((a: any) => ({
    driver_id: Number(a.driver_id),
    start: bogotaDay(a.start_date),
    end: a.end_date ? bogotaDay(a.end_date) : null,
  }));
  // Sin historial: el conductor actual cubre todos los días (criterio de driverOnDate)
  if (!hasHistory && vehicle?.current_driver_id != null) {
    rows = [{ driver_id: Number(vehicle.current_driver_id), start: from, end: null }];
  }

  const ids = [...new Set(rows.map((r) => r.driver_id))];
  const names = new Map<number, string | null>();
  if (ids.length) {
    const { data: drivers } = await supabase.from("drivers").select("id, full_name").in("id", ids);
    for (const d of drivers ?? []) names.set(Number(d.id), d.full_name ?? null);
  }

  base.has_assignment_history = hasHistory;
  base.days = range.map((date) => {
    const drivers: DayDriver[] = rows
      .filter((r) => r.start <= date && (r.end == null || r.end >= date))
      .map((r) => ({ driver_id: r.driver_id, driver_name: names.get(r.driver_id) ?? null, start: r.start, end: r.end }));
    // Día de entrega: lo debe el que entregó el carro (ej. UGP771, 16-oct → Juan Camilo Millán)
    const responsible = drivers.find((d) => d.end === date) ?? drivers[drivers.length - 1] ?? null;
    const isPayable = payable.has(date);
    return { date, payable: isPayable, drivers, responsible, counts_as_mora: isPayable && drivers.length > 0 };
  });
  return base;
}

/**
 * Valida que las fechas a resolver sean días que cuentan como mora y que vayan desde el
 * más antiguo sin saltos: la mora se cuenta desde el último payment_date, así que resolver
 * un día dejando días anteriores sin resolver los sacaría de la mora sin resolverlos.
 */
export function validateDatesToResolve(result: PendingDaysResult, dates: string[]): string | null {
  const wanted = [...new Set(dates)].sort();
  if (!wanted.length) return "Seleccione al menos un día.";
  const counted = result.days.filter((d) => d.counts_as_mora).map((d) => d.date);
  for (const d of wanted) {
    if (!counted.includes(d)) return `El ${d} no es un día pendiente en mora de ${result.plate}.`;
  }
  const expected = counted.slice(0, wanted.length);
  if (expected.join(",") !== wanted.join(",")) {
    return `Resuelva los días en orden desde el más antiguo (${counted[0]}). La mora se cuenta desde el último día registrado.`;
  }
  return null;
}
