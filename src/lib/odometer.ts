// src/lib/odometer.ts
// Odómetro actual por vehículo a partir de vehicle_mileage_logs (Issue #51).
//
// Contrato de la tabla:
//   source = 'manual'       → mileage_km es una lectura ABSOLUTA del odómetro (inspecciones, registro manual)
//   source = 'protrack_api' → mileage_km es el RECORRIDO DIARIO del GPS (delta), NO el odómetro
//
// Odómetro actual = última lectura manual + suma de km GPS registrados después de ella
// (misma fórmula que la RPC get_global_mileage_stats). Sin lectura manual de base no hay
// odómetro confiable → null.
import { supabase } from "./supabase";

export async function getCurrentOdometers(plates: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (plates.length === 0) return out;

  // Paginado para no quedar cortos por el límite de 1000 filas de PostgREST
  const rows: { plate: string; mileage_km: number | string; recorded_at: string; source: string }[] = [];
  const PAGE = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("vehicle_mileage_logs")
      .select("plate, mileage_km, recorded_at, source")
      .in("plate", plates)
      .order("recorded_at", { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as any[]));
    if (!data || data.length < PAGE) break;
  }

  // 1. Última lectura manual por placa
  const lastManual = new Map<string, { km: number; at: number }>();
  for (const r of rows) {
    if (r.source !== "manual") continue;
    const km = Number(r.mileage_km);
    const at = new Date(r.recorded_at).getTime();
    if (!isFinite(km) || km <= 0 || isNaN(at)) continue;
    const prev = lastManual.get(r.plate);
    if (!prev || at > prev.at) lastManual.set(r.plate, { km, at });
  }

  // 2. Sumar el recorrido GPS posterior a esa lectura
  const gpsSince = new Map<string, number>();
  for (const r of rows) {
    if (r.source !== "protrack_api") continue;
    const base = lastManual.get(r.plate);
    if (!base) continue;
    const at = new Date(r.recorded_at).getTime();
    const km = Number(r.mileage_km);
    if (at > base.at && isFinite(km)) gpsSince.set(r.plate, (gpsSince.get(r.plate) || 0) + km);
  }

  for (const [plate, base] of lastManual) {
    out.set(plate, Math.round(base.km + (gpsSince.get(plate) || 0)));
  }
  return out;
}
