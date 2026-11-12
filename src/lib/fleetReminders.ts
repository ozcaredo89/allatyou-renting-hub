// src/lib/fleetReminders.ts
// Resumen diario de alertas de la flota en UN solo correo, agrupado por vehículo (Issues #15, #47):
// SOAT, Tecnomecánica, renovación GPS, último cambio de aceite y días sin inspección.
// Incluye además las alertas de pago de liquidaciones de conductores (20 días SIMIT, Issue #23).
// Es independiente de las suscripciones públicas del landing (reminder_subscriptions).
import { supabase } from "./supabase";
import { sendEmail } from "./email";

/** Días de anticipación (mismos defaults que las suscripciones públicas) */
export const FLEET_DAYS_BEFORE_SOAT = 15;
export const FLEET_DAYS_BEFORE_TECNO = 10;
/** Renovación GPS: avisar 30 días antes (mismo semáforo amarillo de /vehicles) */
export const FLEET_DAYS_BEFORE_GPS = 30;
/** Cambio de aceite: amarillo > 90 días, rojo > 120 días desde el último (mismo semáforo de /vehicles) */
export const OIL_WARN_DAYS = 90;
export const OIL_OVERDUE_DAYS = 120;
/** Inspecciones: amarillo desde 10 días sin revisión, rojo (y correo) desde 15 días */
export const INSPECTION_WARN_DAYS = 10;
export const INSPECTION_ALERT_DAYS = 15;

/** Estados de vehículo que forman parte de la flota operativa (mismo filtro por defecto de /vehicles) */
export const FLEET_OPERATIVE_STATUSES = ["active", "maintenance", "leasing"];

/** Plazo en días calendario tras el retiro para validar SIMIT y pagar la liquidación */
export const LIQUIDATION_SIMIT_DAYS = 20;
/** Días de anticipación para avisar por correo antes de la fecha de pago de la liquidación */
export const LIQUIDATION_DAYS_BEFORE_DUE = 3;

type Severity = "red" | "yellow";

type VehicleAlert = {
  severity: Severity;
  text: string;
};

type VehicleAlertGroup = {
  plate: string;
  driverName: string | null;
  alerts: VehicleAlert[];
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

function describeExpiry(daysLeft: number, expires: string): string {
  if (daysLeft < 0) return `VENCIDO hace ${-daysLeft} día(s) (${expires})`;
  if (daysLeft === 0) return `vence HOY (${expires})`;
  return `vence en ${daysLeft} día(s) (${expires})`;
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


/** Última inspección finalizada por placa (YYYY-MM-DD hora Colombia) */
async function getLastInspectionByPlate(plates: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (plates.length === 0) return out;
  const { data, error } = await supabase
    .from("inspections")
    .select("vehicle_plate, created_at, completed_at, status")
    .in("vehicle_plate", plates)
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const day = ymd(row.completed_at || row.created_at);
    if (!day) continue;
    const prev = out.get(row.vehicle_plate);
    if (!prev || day > prev) out.set(row.vehicle_plate, day);
  }
  return out;
}

/** Último cambio de aceite por placa (gastos con categoría 'Cambio de aceite', igual que /vehicles) */
async function getLastOilChangeByPlate(plates: string[]): Promise<Map<string, string>> {
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
    for (const ev of evs as any[]) {
      const day = ymd(e.date);
      if (ev?.plate && day && !out.has(ev.plate)) out.set(ev.plate, day);
    }
  }
  return out;
}

/**
 * Alertas de la flota agrupadas por vehículo: SOAT, Tecno, GPS, aceite e inspección.
 * Solo vehículos de la flota operativa (active, maintenance, leasing).
 */
export async function getFleetVehicleAlerts(todayStr: string): Promise<VehicleAlertGroup[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("plate, status, soat_expires_at, tecno_expires_at, gps_renewal_date, driver:drivers!current_driver_id(full_name)")
    .in("status", FLEET_OPERATIVE_STATUSES);
  if (error) throw new Error(error.message);

  const vehicles = (data || []) as any[];
  const plates = vehicles.map((v) => v.plate);
  const [lastInspection, lastOil] = await Promise.all([
    getLastInspectionByPlate(plates),
    getLastOilChangeByPlate(plates),
  ]);

  const groups: VehicleAlertGroup[] = [];
  for (const v of vehicles) {
    const alerts: VehicleAlert[] = [];

    const soat = ymd(v.soat_expires_at);
    if (soat) {
      const d = diffDays(todayStr, soat);
      if (d <= FLEET_DAYS_BEFORE_SOAT) alerts.push({ severity: d <= 0 ? "red" : "yellow", text: `SOAT: ${describeExpiry(d, soat)}` });
    }

    const tecno = ymd(v.tecno_expires_at);
    if (tecno) {
      const d = diffDays(todayStr, tecno);
      if (d <= FLEET_DAYS_BEFORE_TECNO)
        alerts.push({ severity: d <= 0 ? "red" : "yellow", text: `Tecnomecánica: ${describeExpiry(d, tecno)}` });
    }

    const gps = ymd(v.gps_renewal_date);
    if (gps) {
      const d = diffDays(todayStr, gps);
      if (d <= FLEET_DAYS_BEFORE_GPS)
        alerts.push({ severity: d <= 0 ? "red" : "yellow", text: `GPS (pago renovación): ${describeExpiry(d, gps)}` });
    }

    const oil = lastOil.get(v.plate);
    if (oil) {
      const since = diffDays(oil, todayStr);
      if (since > OIL_WARN_DAYS)
        alerts.push({
          severity: since > OIL_OVERDUE_DAYS ? "red" : "yellow",
          text: `Cambio de aceite: último hace ${since} día(s) (${oil})${since > OIL_OVERDUE_DAYS ? " — VENCIDO" : " — próximo"}`,
        });
    }

    const insp = lastInspection.get(v.plate);
    if (!insp) {
      alerts.push({ severity: "red", text: "Inspección: SIN REVISIONES registradas" });
    } else {
      const since = diffDays(insp, todayStr);
      if (since >= INSPECTION_ALERT_DAYS)
        alerts.push({ severity: "red", text: `Inspección: ${since} día(s) sin revisión (última ${insp})` });
    }

    if (alerts.length > 0) {
      groups.push({ plate: v.plate, driverName: v.driver?.full_name || null, alerts });
    }
  }

  // Primero los vehículos con más alertas rojas
  const reds = (g: VehicleAlertGroup) => g.alerts.filter((a) => a.severity === "red").length;
  groups.sort((a, b) => reds(b) - reds(a) || b.alerts.length - a.alerts.length || a.plate.localeCompare(b.plate));
  return groups;
}

/**
 * Reserva el envío del día: inserta la fila de hoy en fleet_digest_runs.
 * Devuelve false si ya existía (otra corrida de hoy ya lo envió).
 */
async function claimDailyRun(todayStr: string): Promise<boolean> {
  const { error } = await supabase.from("fleet_digest_runs").insert({ run_date: todayStr });
  if (!error) return true;
  if (error.code === "23505") return false; // ya enviado hoy
  throw new Error(error.message);
}

async function releaseDailyRun(todayStr: string) {
  await supabase.from("fleet_digest_runs").delete().eq("run_date", todayStr);
}

/**
 * Envía el resumen diario de alertas de flota (agrupado por vehículo) y de liquidaciones.
 * Se envía UNA vez al día, en la primera corrida del cron de ese día (hora Colombia), sin importar
 * la hora: el cron de GitHub Actions llega con varias horas de retraso.
 * @param todayStr fecha local Colombia YYYY-MM-DD
 * @param _currentHour hora local Colombia 0-23 (solo informativa)
 * @param force reenvía aunque ya se haya enviado hoy (disparo manual)
 */
export async function runFleetReminders(
  todayStr: string,
  _currentHour: number,
  force = false
): Promise<FleetReminderResult> {
  const recipients = getRecipients();
  if (recipients.length === 0) {
    return { skipped: "FLEET_REMINDER_EMAILS no configurado" };
  }

  if (!force && !(await claimDailyRun(todayStr))) {
    return { skipped: `resumen de flota ya enviado hoy (${todayStr})` };
  }

  try {
    const groups = await getFleetVehicleAlerts(todayStr);
    const liquidationItems = await getPendingLiquidationReminders(todayStr);

    const alertCount = groups.reduce((n, g) => n + g.alerts.length, 0);
    if (groups.length === 0 && liquidationItems.length === 0) {
      const result = { recipients: recipients.length, items: 0, liquidationItems: 0, sent: 0 };
      await supabase.from("fleet_digest_runs").update({ result }).eq("run_date", todayStr);
      return result;
    }

    const liqLine = (l: LiquidationReminderItem) =>
      `• ${l.driverName} (${l.plate}) — Retiro: ${l.retireDate} | Pago liquidación (20 días SIMIT): ${describeLiquidation(l)} | ${
        l.finalBalance > 0
          ? `Saldo a devolver: $${l.finalBalance.toLocaleString("es-CO")}`
          : `Sin saldo a devolver ($${l.finalBalance.toLocaleString("es-CO")}): marcar como saldada`
      }`;

    const sections: string[] = [`Resumen diario de alertas operativas AllAtYou (${todayStr}):`];

    if (liquidationItems.length > 0) {
      sections.push(
        `LIQUIDACIONES DE CONDUCTORES POR PAGAR — PLAZO 20 DÍAS SIMIT (${liquidationItems.length}):\n` +
          `${liquidationItems.map(liqLine).join("\n")}\n` +
          `👉 Ver calendario de retiros, Paz y Salvo y subir comprobante de pago en: https://web.allatyou.com/drivers?view=calendar`
      );
    }

    if (groups.length > 0) {
      const icon = (s: Severity) => (s === "red" ? "🔴" : "🟡");
      const blocks = groups.map((g) => {
        const head = `▶ ${g.plate}${g.driverName ? ` — ${g.driverName}` : ""}`;
        const lines = g.alerts
          .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "red" ? -1 : 1))
          .map((a) => `   ${icon(a.severity)} ${a.text}`);
        return [head, ...lines].join("\n");
      });
      sections.push(`FLOTA — ALERTAS POR VEHÍCULO (${groups.length} vehículo(s), ${alertCount} alerta(s)):\n\n${blocks.join("\n\n")}`);
      sections.push(
        `🔴 vencido / urgente · 🟡 próximo a vencer\n` +
          `• SOAT/Tecno/GPS/aceite: al pagar, regístralo en Gastos (/expenses) para actualizar la ficha del vehículo.\n` +
          `• Inspecciones: crea la revisión en https://web.allatyou.com/inspections/new\n` +
          `👉 Ver flota: https://web.allatyou.com/vehicles`
      );
    }

    const text = sections.join("\n\n");

    const subjectParts: string[] = [];
    if (liquidationItems.length > 0) subjectParts.push(`${liquidationItems.length} liquidación(es) por pagar (SIMIT)`);
    if (groups.length > 0) subjectParts.push(`${groups.length} vehículo(s) con alertas`);
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

    const result = {
      recipients: recipients.length,
      items: alertCount,
      liquidationItems: liquidationItems.length,
      sent,
      errors,
    };

    // Si no salió ningún correo, liberar el día para que la siguiente corrida lo reintente
    if (sent === 0 && !force) await releaseDailyRun(todayStr);
    else await supabase.from("fleet_digest_runs").update({ result }).eq("run_date", todayStr);

    return result;
  } catch (e) {
    if (!force) await releaseDailyRun(todayStr);
    throw e;
  }
}