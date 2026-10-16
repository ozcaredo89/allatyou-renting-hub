// Cliente de TallerPro (API de integraciones v1, solo lectura).
// GET {TALLERPRO_API_URL}/v1/vehiculos/{placa}/historial  · header X-API-Key: TALLERPRO_API_KEY
// La API busca la placa exacta y devuelve los ingresos con fecha de entrada y de salida.
// Regla: la consulta es best-effort. Si falla (sin key, timeout, 4xx/5xx) se devuelve
// available=false y el flujo que la usa debe seguir como si no existiera.

const DEFAULT_BASE = "https://allatyou-taller-production.up.railway.app/api/integraciones";
const TIMEOUT_MS = 3000;
// TODO: hoy los fallos de TallerPro solo quedan en console.warn. Crear una tarea que
// registre cada fallo (placa, status/timeout, fecha) y envíe un reporte periódico
// para detectar y corregir problemas de la integración (key revocada, 429, caídas).

/** Días máximos entre el día marcado y el ingreso más cercano antes de alertar "fecha muy lejana". */
export const MAX_MAINTENANCE_DISTANCE_DAYS = 3;

export type TallerStay = {
  id: string;
  estado: string;
  motivo_visita: string | null;
  /** Día de entrada (YYYY-MM-DD, hora Bogotá) */
  entrada: string;
  /** Día de salida (YYYY-MM-DD, hora Bogotá); null si sigue en el taller */
  salida: string | null;
  /** "bitacora" = exacta · "estimada" = aproximada · null = sigue adentro */
  salida_fuente: "bitacora" | "estimada" | null;
};

export type TallerCheck = {
  /** false si no se pudo consultar el taller; en ese caso no se muestra nada ni se bloquea */
  available: boolean;
  in_shop: boolean;
  /** Estadías no canceladas, de la más reciente a la más antigua */
  stays: TallerStay[];
};

export type MaintenanceWarning = {
  code: "OUT_OF_RANGE" | "TOO_FAR" | "DATE_USED";
  message: string;
};

export type MaintenanceValidation = {
  /** Estadía que cubre el día (sin warnings) */
  covering_stay: TallerStay | null;
  /** Estadía más cercana cuando ninguna cubre el día */
  nearest_stay: TallerStay | null;
  distance_days: number | null;
  warnings: MaintenanceWarning[];
};

const UNAVAILABLE: TallerCheck = { available: false, in_shop: false, stays: [] };

/** ISO → YYYY-MM-DD en hora de Bogotá */
export const bogotaDay = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

const dayNum = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) / 86_400_000;

function toStay(o: any): TallerStay {
  // fecha_salida viene de la bitácora; si la API aún no la trae, se estima con el momento
  // en que el ingreso pasó a entregado (estado_desde) o la última modificación.
  let salidaIso: string | null = o.fecha_salida ?? null;
  let fuente: TallerStay["salida_fuente"] = salidaIso ? (o.fecha_salida_fuente === "bitacora" ? "bitacora" : "estimada") : null;
  if (!salidaIso && !o.activo) {
    salidaIso = o.estado_desde || o.ultima_actualizacion || o.fecha_ingreso;
    fuente = "estimada";
  }
  return {
    id: String(o.id),
    estado: String(o.estado),
    motivo_visita: o.motivo_visita ?? null,
    entrada: bogotaDay(o.fecha_ingreso),
    salida: salidaIso ? bogotaDay(salidaIso) : null,
    salida_fuente: fuente,
  };
}

export async function checkVehicleInShop(plate: string): Promise<TallerCheck> {
  const key = process.env.TALLERPRO_API_KEY || "";
  if (!key) return UNAVAILABLE;
  const base = (process.env.TALLERPRO_API_URL || DEFAULT_BASE).replace(/\/+$/, "");
  const placa = String(plate || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/vehiculos/${encodeURIComponent(placa)}/historial`, {
      headers: { "X-API-Key": key },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[taller] historial ${placa} respondió ${res.status}`);
      return UNAVAILABLE;
    }
    const body: any = await res.json();
    const ingresos: any[] = Array.isArray(body?.ingresos) ? body.ingresos : [];
    return {
      available: true,
      in_shop: !!body?.en_taller,
      stays: ingresos.filter((i) => i?.estado !== "cancelado" && i?.fecha_ingreso).map(toStay),
    };
  } catch (e: any) {
    console.warn(`[taller] historial ${placa} falló: ${e?.name === "AbortError" ? "timeout" : e?.message}`);
    return UNAVAILABLE;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Valida un día de mantenimiento contra las estadías del carro en el taller.
 * - Si el día cae dentro de [entrada, salida] de alguna estadía (o sigue adentro) → sin warnings,
 *   aunque haya otros días marcados (una estadía larga cubre varios días).
 * - Si no: OUT_OF_RANGE (con la estadía más cercana), TOO_FAR si está a más de
 *   MAX_MAINTENANCE_DISTANCE_DAYS días, y DATE_USED si ese día ya tiene otro pago.
 * Solo se llama cuando taller.available = true.
 */
export function validateMaintenanceDay(
  day: string,
  taller: TallerCheck,
  otherPaymentsSameDay: { id: number; amount: number; status: string }[]
): MaintenanceValidation {
  const d = dayNum(day);
  const today = bogotaDay(new Date());
  const rangeOf = (s: TallerStay) => [dayNum(s.entrada), dayNum(s.salida ?? today)] as const;

  const covering = taller.stays.find((s) => {
    const [a, b] = rangeOf(s);
    return d >= a && d <= b;
  });
  if (covering) return { covering_stay: covering, nearest_stay: null, distance_days: 0, warnings: [] };

  let nearest: TallerStay | null = null;
  let distance: number | null = null;
  for (const s of taller.stays) {
    const [a, b] = rangeOf(s);
    const dist = d < a ? a - d : d - b;
    if (distance === null || dist < distance) {
      distance = dist;
      nearest = s;
    }
  }

  const warnings: MaintenanceWarning[] = [];
  warnings.push({
    code: "OUT_OF_RANGE",
    message: nearest
      ? `El ${day} el carro no estaba en el taller. Estadía más cercana: entrada ${nearest.entrada}, salida ${nearest.salida ?? "sigue en taller"}${nearest.salida_fuente === "estimada" ? " (estimada)" : ""}${nearest.motivo_visita ? ` · ${nearest.motivo_visita.trim()}` : ""}.`
      : `El ${day} el carro no estaba en el taller. No tiene ingresos registrados en TallerPro.`,
  });
  if (distance === null || distance > MAX_MAINTENANCE_DISTANCE_DAYS) {
    warnings.push({
      code: "TOO_FAR",
      message: distance === null
        ? "No hay ningún ingreso al taller con el cual relacionar este día."
        : `La estadía más cercana está a ${distance} días del ${day} (máximo ${MAX_MAINTENANCE_DISTANCE_DAYS}).`,
    });
  }
  if (otherPaymentsSameDay.length) {
    warnings.push({
      code: "DATE_USED",
      message: `El ${day} ya tiene otro pago registrado: ${otherPaymentsSameDay
        .map((p) => `#${p.id} ($${Number(p.amount)}, ${p.status})`)
        .join(", ")}.`,
    });
  }
  return { covering_stay: null, nearest_stay: nearest, distance_days: distance, warnings };
}
