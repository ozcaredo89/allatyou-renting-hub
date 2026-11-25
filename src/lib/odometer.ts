// src/lib/odometer.ts
// Odómetro por vehículo a partir de vehicle_mileage_logs (Issue #51).
//
// Contrato de la tabla:
//   source = 'manual'       → mileage_km es una lectura ABSOLUTA del odómetro (inspecciones, registro manual)
//   source = 'protrack_api' → mileage_km es el RECORRIDO DIARIO del GPS (delta), NO el odómetro
//
// Odómetro = última lectura manual + suma de km GPS registrados después de ella
// (misma fórmula que la RPC get_global_mileage_stats). Sin lectura manual de base no hay
// odómetro confiable → null.
import { supabase } from "./supabase";

export type MileageRow = { plate: string; mileage_km: number | string; recorded_at: string; source: string };

/** Todas las filas de vehicle_mileage_logs de las placas (paginado por el límite de 1000 de PostgREST). */
export async function fetchMileageRows(plates: string[]): Promise<MileageRow[]> {
  const rows: MileageRow[] = [];
  if (plates.length === 0) return rows;
  const PAGE = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("vehicle_mileage_logs")
      .select("plate, mileage_km, recorded_at, source")
      .in("plate", plates)
      .order("recorded_at", { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as MileageRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Odómetro de una placa en el instante `asOf` (ms) usando solo filas registradas hasta ese momento.
 * Sin `asOf` = odómetro actual. Devuelve null si no hay lectura manual de base.
 */
export function odometerFromRows(rows: MileageRow[], plate: string, asOf = Infinity): number | null {
  let base: { km: number; at: number } | null = null;
  for (const r of rows) {
    if (r.plate !== plate || r.source !== "manual") continue;
    const km = Number(r.mileage_km);
    const at = new Date(r.recorded_at).getTime();
    if (!isFinite(km) || km <= 0 || isNaN(at) || at > asOf) continue;
    if (!base || at > base.at) base = { km, at };
  }
  if (!base) return null;

  let gps = 0;
  for (const r of rows) {
    if (r.plate !== plate || r.source !== "protrack_api") continue;
    const at = new Date(r.recorded_at).getTime();
    const km = Number(r.mileage_km);
    if (at > base.at && at <= asOf && isFinite(km)) gps += km;
  }
  return Math.round(base.km + gps);
}

export async function getCurrentOdometers(plates: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const rows = await fetchMileageRows(plates);
  for (const plate of plates) {
    const km = odometerFromRows(rows, plate);
    if (km != null) out.set(plate, km);
  }
  return out;
}
