// src/lib/oilChange.ts
// Cambio de aceite por kilometraje + días (Issue #83). Reglas en docs/specs/recordatorios.md.
//
// - Último cambio = último gasto con categoría 'Cambio de aceite' de la placa.
// - Km del último cambio = odómetro del vehículo al cierre de ese día (hora Colombia). Si al
//   registrar el gasto se digitó el km, queda como lectura manual de ese día y es la que se usa.
// - Próximo cambio = km del último cambio + OIL_INTERVAL_KM.
// - Semáforo por km: amarillo si faltan ≤ OIL_WARN_KM, rojo si ya se pasó.
// - Semáforo por días: amarillo > OIL_WARN_DAYS, rojo > OIL_OVERDUE_DAYS.
// - Manda el peor de los dos (lo que se cumpla primero).
import { supabase } from "./supabase";
import { fetchMileageRows, odometerFromRows, lastManualReading } from "./odometer";

export const OIL_INTERVAL_KM = 10000;
export const OIL_WARN_KM = 1000;
export const OIL_WARN_DAYS = 90;
export const OIL_OVERDUE_DAYS = 120;
/** Lectura de km del tablero (Issue #87): al menos una por semana. Amarillo > 7 días, rojo > 14 días o nunca. */
export const KM_READING_WARN_DAYS = 7;
export const KM_READING_ALERT_DAYS = 14;

export type OilLevel = "green" | "yellow" | "red" | "none";

export type OilStatus = {
  last_oil_change_date: string | null;
  last_oil_km: number | null;
  next_oil_km: number | null;
  current_km: number | null;
  km_remaining: number | null;
  days_since: number | null;
  km_level: OilLevel;
  days_level: OilLevel;
  level: OilLevel;
  // Última lectura manual del km (Issue #87)
  last_km_reading_at: string | null;
  last_km_reading_km: number | null;
  km_reading_days: number | null;
  km_reading_level: "green" | "yellow" | "red";
};

const RANK: Record<OilLevel, number> = { none: 0, green: 1, yellow: 2, red: 3 };
const worst = (a: OilLevel, b: OilLevel): OilLevel => (RANK[a] >= RANK[b] ? a : b);

/** Fin del día YYYY-MM-DD en hora de Colombia (UTC-5, sin horario de verano), en ms. */
function endOfBogotaDay(ymd: string): number {
  return Date.parse(`${ymd}T23:59:59.999-05:00`);
}

function todayBogota(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Último cambio de aceite (YYYY-MM-DD) por placa. */
export async function getLastOilChangeByPlate(plates: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (plates.length === 0) return out;
  const { data, error } = await supabase
    .from("expenses")
    .select("date, expense_vehicles!inner(plate)")
    .eq("category", "Cambio de aceite")
    .in("expense_vehicles.plate", plates)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  for (const e of data || []) {
    const evs = Array.isArray(e.expense_vehicles) ? e.expense_vehicles : [e.expense_vehicles];
    const day = String(e.date || "").slice(0, 10);
    for (const ev of evs as any[]) {
      if (ev?.plate && day && !out.has(ev.plate)) out.set(ev.plate, day);
    }
  }
  return out;
}

/** Estado de cambio de aceite (km + días) por placa. */
export async function getOilStatusByPlate(plates: string[]): Promise<Map<string, OilStatus>> {
  const out = new Map<string, OilStatus>();
  if (plates.length === 0) return out;

  const [lastOil, rows] = await Promise.all([getLastOilChangeByPlate(plates), fetchMileageRows(plates)]);
  const today = Date.parse(`${todayBogota()}T00:00:00Z`);

  for (const plate of plates) {
    const date = lastOil.get(plate) || null;
    const current = odometerFromRows(rows, plate);

    let lastKm: number | null = null;
    let daysSince: number | null = null;
    if (date) {
      lastKm = odometerFromRows(rows, plate, endOfBogotaDay(date));
      daysSince = Math.round((today - Date.parse(`${date}T00:00:00Z`)) / 86400000);
    }

    const reading = lastManualReading(rows, plate);
    const readingDays = reading
      ? Math.max(0, Math.round((today - Date.parse(`${new Date(Date.parse(reading.at) - 5 * 3600 * 1000).toISOString().slice(0, 10)}T00:00:00Z`)) / 86400000))
      : null;
    const readingLevel: "green" | "yellow" | "red" =
      readingDays == null || readingDays > KM_READING_ALERT_DAYS ? "red" : readingDays > KM_READING_WARN_DAYS ? "yellow" : "green";

    const nextKm = lastKm != null ? lastKm + OIL_INTERVAL_KM : null;
    const remaining = nextKm != null && current != null ? nextKm - current : null;

    const kmLevel: OilLevel = remaining == null ? "none" : remaining <= 0 ? "red" : remaining <= OIL_WARN_KM ? "yellow" : "green";
    const daysLevel: OilLevel =
      daysSince == null ? "none" : daysSince > OIL_OVERDUE_DAYS ? "red" : daysSince > OIL_WARN_DAYS ? "yellow" : "green";

    out.set(plate, {
      last_oil_change_date: date,
      last_oil_km: lastKm,
      next_oil_km: nextKm,
      current_km: current,
      km_remaining: remaining,
      days_since: daysSince,
      km_level: kmLevel,
      days_level: daysLevel,
      level: worst(kmLevel, daysLevel),
      last_km_reading_at: reading?.at ?? null,
      last_km_reading_km: reading?.km ?? null,
      km_reading_days: readingDays,
      km_reading_level: readingLevel,
    });
  }
  return out;
}
