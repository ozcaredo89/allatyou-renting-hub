// src/lib/noPay.ts
import { supabase } from "./supabase";

/** Devuelve 1..7 (Lunes=1, Domingo=7) en UTC */
function getWeekday1to7(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const w0 = d.getUTCDay(); // 0..6 (Domingo=0)
  return w0 === 0 ? 7 : w0;
}

/** Último dígito de la placa, o null si no hay dígito al final */
function lastDigitOfPlate(plate: string): number | null {
  const m = plate.match(/\d$/);
  return m ? Number(m[0]) : null;
}

export type NoPayReasonCode =
  | "INVALID_PLATE"
  | "INVALID_DATE"
  | "CAL_ALL"
  | "CAL_PLATES"
  | "CAL_ERROR"
  | "RULE_WEEKDAY"
  | "RULE_ERROR";

export type NoPayReason = {
  code: NoPayReasonCode;
  message: string;
};

export type NoPayCheck = {
  noPay: boolean;
  reasons: NoPayReason[];
  source: "calendar" | "rule" | "none";
};

function isValidPlate(p: string) {
  return /^[A-Z]{3}\d{3}$/.test(p);
}
function isValidISODate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/**
 * Verifica si una fecha es "no paga" para una placa:
 * - Prioridad: calendario (excepciones) > reglas semanales
 * - city por defecto "Cali"
 */
export async function isNoPayDay(
  plate: string,
  date: string,
  city = "Cali"
): Promise<NoPayCheck> {
  const reasons: NoPayReason[] = [];
  const p = plate.toUpperCase().trim();

  if (!isValidPlate(p)) {
    reasons.push({ code: "INVALID_PLATE", message: "Placa inválida (formato ABC123)." });
    return { noPay: false, reasons, source: "none" };
  }
  if (!isValidISODate(date)) {
    reasons.push({ code: "INVALID_DATE", message: "Fecha inválida (debe ser YYYY-MM-DD)." });
    return { noPay: false, reasons, source: "none" };
  }

  const last = lastDigitOfPlate(p);
  const weekday = getWeekday1to7(date);

  // Disparamos consultas en paralelo
  const calPromise = supabase
    .from("no_pay_calendar")
    .select("reason, applies_to_scope, applies_to")
    .eq("city", city)
    .eq("date", date);

  const rulesPromise = supabase
    .from("no_pay_rules")
    .select("ends_in, active_from, active_to, weekday")
    .eq("city", city)
    .eq("weekday", weekday)
    .lte("active_from", date) // active_from <= date
    .gte("active_to", date);  // date <= active_to  (inclusivo)

  const [calRes, ruleRes] = await Promise.allSettled([calPromise, rulesPromise]);

  // 1) Calendario (tiene prioridad)
  if (calRes.status === "fulfilled") {
    const { data: cal, error: calErr } = calRes.value;
    if (calErr) {
      reasons.push({ code: "CAL_ERROR", message: "Error consultando calendario." });
    } else if (Array.isArray(cal) && cal.length > 0) {
      for (const row of cal as any[]) {
        if (row.applies_to_scope === "all") {
          reasons.push({
            code: "CAL_ALL",
            message: row.reason || "Día no pagable (excepción general).",
          });
          return { noPay: true, reasons, source: "calendar" };
        }
        if (
          row.applies_to_scope === "plates" &&
          Array.isArray(row.applies_to) &&
          row.applies_to.includes(p)
        ) {
          reasons.push({
            code: "CAL_PLATES",
            message: row.reason || "Día no pagable (excepción por placa).",
          });
          return { noPay: true, reasons, source: "calendar" };
        }
      }
    }
  } else {
    reasons.push({ code: "CAL_ERROR", message: "Error consultando calendario." });
  }

  // 2) Reglas semanales (si aplica)
  if (last != null) {
    if (ruleRes.status === "fulfilled") {
      const { data: rules, error: ruleErr } = ruleRes.value;
      if (ruleErr) {
        reasons.push({ code: "RULE_ERROR", message: "Error consultando reglas." });
      } else if (
        Array.isArray(rules) &&
        rules.some((r: any) => Array.isArray(r.ends_in) && r.ends_in.includes(last))
      ) {
        reasons.push({
          code: "RULE_WEEKDAY",
          message: `Pico y placa por último dígito ${last}.`,
        });
        return { noPay: true, reasons, source: "rule" };
      }
    } else {
      reasons.push({ code: "RULE_ERROR", message: "Error consultando reglas." });
    }
  }

  return { noPay: false, reasons, source: "none" };
}

/**
 * Busca la próxima fecha pagable desde fromDate (opcionalmente incluyendo fromDate).
 * Devuelve también los días que se saltaron con motivo.
 */
export async function nextPayableDate(
  plate: string,
  fromDate: string,
  includeFrom = false,
  city = "Cali"
): Promise<{ nextDate: string; skipped: { date: string; source: NoPayCheck["source"]; reasons: NoPayReason[] }[] }> {
  if (!isValidISODate(fromDate)) {
    throw new Error("fromDate must be YYYY-MM-DD");
  }

  let d = new Date(fromDate + "T00:00:00Z");
  if (!includeFrom) d.setUTCDate(d.getUTCDate() + 1);

  const skipped: { date: string; source: NoPayCheck["source"]; reasons: NoPayReason[] }[] = [];

  for (let i = 0; i < 60; i++) {
    const iso = d.toISOString().slice(0, 10);
    const check = await isNoPayDay(plate, iso, city);
    if (!check.noPay) {
      return { nextDate: iso, skipped };
    }
    skipped.push({ date: iso, source: check.source, reasons: check.reasons });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  throw new Error("No payable date found in 60 days");
}
