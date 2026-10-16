import { supabase } from "./supabase";

// Un anticipo operacional pertenece a un conductor. Solo debe tenerse en cuenta en el pago
// diario de una placa si ese conductor es quien tenía el carro el día que se paga
// (vehicle_assignments). Ej.: ICV061 — el anticipo #92 es de Brayan Luna (hasta 26-sep);
// los pagos de Bairo Castro (desde 26-sep) no deben abonarle.

/** Conductor asignado a la placa en una fecha (YYYY-MM-DD). Si no hay historial, el actual. */
export async function driverOnDate(plate: string, date: string): Promise<number | null> {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("vehicle_assignments")
    .select("driver_id, start_date, end_date")
    .eq("plate", plate)
    .lte("start_date", `${day}T23:59:59`)
    .or(`end_date.is.null,end_date.gte.${day}`)
    .order("start_date", { ascending: false })
    .limit(1);
  if (data && data[0]?.driver_id != null) return Number(data[0].driver_id);

  const { data: v } = await supabase.from("vehicles").select("current_driver_id").eq("plate", plate).maybeSingle();
  return v?.current_driver_id != null ? Number(v.current_driver_id) : null;
}

/** Dueño del anticipo: driver_id o, si está vacío, el conductor con el mismo nombre (person_name). */
export async function advanceOwnerId(advance: { driver_id?: number | null; person_name?: string | null }): Promise<number | null> {
  if (advance.driver_id != null) return Number(advance.driver_id);
  const name = String(advance.person_name || "").trim();
  if (!name) return null;
  const { data } = await supabase.from("drivers").select("id").ilike("full_name", name).limit(2);
  return data && data.length === 1 ? Number(data[0]!.id) : null;
}

/**
 * true si el anticipo aplica al pago de esa placa en esa fecha.
 * Si no se puede saber el dueño o el conductor del día, se asume que aplica (no se bloquea).
 */
export async function advanceAppliesOn(
  advance: { driver_id?: number | null; person_name?: string | null },
  plate: string,
  date: string
): Promise<boolean> {
  const owner = await advanceOwnerId(advance);
  if (owner == null) return true;
  const driver = await driverOnDate(plate, date);
  if (driver == null) return true;
  return owner === driver;
}

/**
 * Anticipos activos de la placa que aplican al conductor de esa fecha.
 * `select` debe incluir las columnas que necesita el llamador; driver_id y person_name se agregan solos.
 */
export async function activeAdvancesForDriver(plate: string, date: string, select: string): Promise<any[]> {
  const { data } = await supabase
    .from("operational_advances")
    .select(`${select}, driver_id, person_name`)
    .eq("plate", plate)
    .eq("status", "active");
  const out: any[] = [];
  for (const adv of data ?? []) {
    if (await advanceAppliesOn(adv as any, plate, date)) out.push(adv);
  }
  return out;
}

/** Primer anticipo activo de la placa que aplica al conductor de esa fecha (o null). */
export async function activeAdvanceForDriver(plate: string, date: string, select: string): Promise<any | null> {
  return (await activeAdvancesForDriver(plate, date, select))[0] ?? null;
}
