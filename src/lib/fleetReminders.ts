// src/lib/fleetReminders.ts
// Resumen diario de vencimientos de SOAT / Tecnomecánica de la flota (Issue #15)
// y alertas de pago de liquidaciones de conductores 3 días antes de cumplir los 20 días SIMIT (Issue #23).
import { supabase } from "./supabase";
import { sendEmail } from "./email";

/** Días de anticipación (mismos defaults que las suscripciones públicas) */
export const FLEET_DAYS_BEFORE_SOAT = 15;
export const FLEET_DAYS_BEFORE_TECNO = 10;

/** Plazo en días calendario tras el retiro para validar SIMIT y pagar la liquidación */
export const LIQUIDATION_SIMIT_DAYS = 20;
/** Días de anticipación para avisar por correo antes de la fecha de pago de la liquidación */
export const LIQUIDATION_DAYS_BEFORE_DUE = 3;

/** Horas locales (Colombia) en las que se envía: corrida de la mañana, tolerante a retrasos del cron */
const FLEET_SEND_HOURS = [5, 6, 7, 8, 9];

type FleetItem = {
  plate: string;
  kind: "SOAT" | "Tecnomecánica";
  expires: string; // YYYY-MM-DD
  daysLeft: number; // negativo = vencido
};

export type LiquidationReminderItem = {
  liquidationId: string;
  driverId: number;
  driverName: string;
  plate: string;
  retireDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD (retiro + 20 días calendario)
  daysLeft: number; // negativo = vencido
  finalBalance: number;
};

export type FleetReminderResult = {
  skipped?: string;
  recipients?: number;
  items?: number;
  liquidationItems?: number;
  sent?: number;
  errors?: { to: string; error: string }[];
};

/** Destinatarios desde FLEET_REMINDER_EMAILS (separados por coma) */
function getRecipients(): string[] {
  return String(process.env.FLEET_REMINDER_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

/**
 * Fecha YYYY-MM-DD en hora Colombia (America/Bogota, UTC-5 sin horario de verano).
 * Las columnas `date` (YYYY-MM-DD puro) se devuelven tal cual; los timestamps se convierten
 * a la fecha local, para no correr un día los registros hechos después de las 7 pm.
 */
export function bogotaYmd(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    return m ? m[1]! : null;
  }
  return new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
}

const ymd = bogotaYmd;

/** Suma N días calendario a una fecha YYYY-MM-DD */
export function addCalendarDays(baseYmd: string, days: number): string {
  const t = Date.UTC(+baseYmd.slice(0, 4), +baseYmd.slice(5, 7) - 1, +baseYmd.slice(8, 10));
  const d = new Date(t + days * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Diferencia en días entre dos fechas YYYY-MM-DD (b - a) */
function diffDays(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / 86400000);
}

function describe(it: FleetItem): string {
  if (it.daysLeft < 0) return `VENCIDO hace ${-it.daysLeft} día(s) (${it.expires})`;
  if (it.daysLeft === 0) return `vence HOY (${it.expires})`;
  return `vence en ${it.daysLeft} día(s) (${it.expires})`;
}

function describeLiquidation(it: LiquidationReminderItem): string {
  if (it.daysLeft < 0) return `VENCIDA hace ${-it.daysLeft} día(s) (debía pagarse el ${it.dueDate})`;
  if (it.daysLeft === 0) return `vence HOY (${it.dueDate}) — se cumplen los 20 días SIMIT`;
  return `vence en ${it.daysLeft} día(s) (${it.dueDate})`;
}

/**
 * Obtiene las liquidaciones pendientes de pago que están dentro de la ventana de recordatorio (<= 3 días para cumplir 20 días SIMIT).
 */
export async function getPendingLiquidationReminders(todayStr: string): Promise<LiquidationReminderItem[]> {
  // Solo las que aún NO están marcadas como pagadas/saldadas (paid_at) ni tienen comprobante
  const { data: unpaid, error: liqErr } = await supabase
    .from("liquidations")
    .select("id, driver_id, plate, liquidation_date, created_at, payment_due_date, final_balance")
    .is("paid_at", null)
    .is("payment_proof_url", null)
    .order("liquidation_date", { ascending: true });

  if (liqErr) throw liqErr;
  if (!unpaid || unpaid.length === 0) return [];

  const driverIds = Array.from(new Set(unpaid.map((l: any) => Number(l.driver_id)).filter(Boolean)));
  const driverMap = new Map<number, string>();
  if (driverIds.length > 0) {
    const { data: drivers } = await supabase
      .from("drivers")
      .select("id, full_name")
      .in("id", driverIds);
    for (const d of drivers || []) {
      driverMap.set(Number(d.id), d.full_name || `Conductor #${d.id}`);
    }
  }

  const out: LiquidationReminderItem[] = [];
  for (const l of unpaid) {
    const retireDate = ymd(l.liquidation_date || l.created_at);
    if (!retireDate) continue;
    const dueDate = ymd(l.payment_due_date) || addCalendarDays(retireDate, LIQUIDATION_SIMIT_DAYS);

    const daysLeft = diffDays(todayStr, dueDate);
    if (daysLeft <= LIQUIDATION_DAYS_BEFORE_DUE) {
      out.push({
        liquidationId: String(l.id),
        driverId: Number(l.driver_id),
        driverName: driverMap.get(Number(l.driver_id)) || `Conductor #${l.driver_id}`,
        plate: l.plate || "SIN PLACA",
        retireDate,
        dueDate,
        daysLeft,
        finalBalance: Number(l.final_balance || 0),
      });
    }
  }

  out.sort((a, b) => a.daysLeft - b.daysLeft || a.driverName.localeCompare(b.driverName));
  return out;
}

/**
 * Envía el resumen de vencimientos de la flota (SOAT, Tecnomecánica) y de liquidaciones de conductores (20 días SIMIT).
 * @param todayStr fecha local Colombia YYYY-MM-DD
 * @param currentHour hora local Colombia 0-23
 * @param force ignora la ventana horaria (disparo manual)
 */
export async function runFleetReminders(
  todayStr: string,
  currentHour: number,
  force = false
): Promise<FleetReminderResult> {
  if (!force && !FLEET_SEND_HOURS.includes(currentHour)) {
    return { skipped: `fuera de horario (hora local ${currentHour})` };
  }
  // Solo la primera corrida dentro de la ventana: 10:00 UTC = 5am local; si el cron se retrasa
  // sigue cayendo en la ventana, y la corrida de 15:00 UTC (10am local) queda fuera.

  const recipients = getRecipients();
  if (recipients.length === 0) {
    return { skipped: "FLEET_REMINDER_EMAILS no configurado" };
  }

  const { data, error } = await supabase
    .from("vehicles")
    .select("plate, status, soat_expires_at, tecno_expires_at")
    .in("status", ["active", "maintenance"]);
  if (error) throw new Error(error.message);

  const items: FleetItem[] = [];
  for (const v of data || []) {
    const soat = ymd(v.soat_expires_at);
    if (soat) {
      const daysLeft = diffDays(todayStr, soat);
      if (daysLeft <= FLEET_DAYS_BEFORE_SOAT) items.push({ plate: v.plate, kind: "SOAT", expires: soat, daysLeft });
    }
    const tecno = ymd(v.tecno_expires_at);
    if (tecno) {
      const daysLeft = diffDays(todayStr, tecno);
      if (daysLeft <= FLEET_DAYS_BEFORE_TECNO)
        items.push({ plate: v.plate, kind: "Tecnomecánica", expires: tecno, daysLeft });
    }
  }

  const liquidationItems = await getPendingLiquidationReminders(todayStr);

  if (items.length === 0 && liquidationItems.length === 0) {
    return { recipients: recipients.length, items: 0, liquidationItems: 0, sent: 0 };
  }

  items.sort((a, b) => a.daysLeft - b.daysLeft || a.plate.localeCompare(b.plate));
  const expired = items.filter((i) => i.daysLeft < 0);
  const upcoming = items.filter((i) => i.daysLeft >= 0);

  const line = (i: FleetItem) => `• ${i.plate} — ${i.kind}: ${describe(i)}`;
  const liqLine = (l: LiquidationReminderItem) =>
    `• ${l.driverName} (${l.plate}) — Retiro: ${l.retireDate} | Pago liquidación (20 días SIMIT): ${describeLiquidation(l)} | ${
      l.finalBalance > 0
        ? `Saldo a devolver: $${l.finalBalance.toLocaleString("es-CO")}`
        : `Sin saldo a devolver ($${l.finalBalance.toLocaleString("es-CO")}): marcar como saldada`
    }`;

  const sections: string[] = [`Resumen diario de alertas operativas AllAtYou (${todayStr}):\n`];

  if (liquidationItems.length > 0) {
    sections.push(
      `LIQUIDACIONES DE CONDUCTORES POR PAGAR — PLAZO 20 DÍAS SIMIT (${liquidationItems.length}):\n` +
        `${liquidationItems.map(liqLine).join("\n")}\n` +
        `👉 Ver calendario de retiros, Paz y Salvo y subir comprobante de pago en: https://web.allatyou.com/drivers?view=calendar`
    );
  }

  if (expired.length > 0) {
    sections.push(`FLOTA — DOCUMENTOS VENCIDOS (${expired.length}):\n${expired.map(line).join("\n")}`);
  }

  if (upcoming.length > 0) {
    sections.push(`FLOTA — PRÓXIMOS A VENCER (${upcoming.length}):\n${upcoming.map(line).join("\n")}`);
  }

  if (items.length > 0) {
    sections.push(`Al pagar la renovación de SOAT/Tecnomecánica, regístrala en Gastos (/expenses) para actualizar la ficha del vehículo.`);
  }

  const text = sections.join("\n\n");

  const subjectParts: string[] = [];
  if (liquidationItems.length > 0) {
    subjectParts.push(`${liquidationItems.length} liquidación(es) por pagar (SIMIT)`);
  }
  if (items.length > 0) {
    subjectParts.push(`${expired.length} vencido(s), ${upcoming.length} por vencer`);
  }
  const subject = `Alertas AllAtYou: ${subjectParts.join(" · ")}`;

  let sent = 0;
  const errors: { to: string; error: string }[] = [];
  for (const to of recipients) {
    try {
      await sendEmail({ to, subject, text });
      sent++;
    } catch (e: any) {
      errors.push({ to, error: e?.message || String(e) });
    }
  }
  return {
    recipients: recipients.length,
    items: items.length,
    liquidationItems: liquidationItems.length,
    sent,
    errors,
  };
}
