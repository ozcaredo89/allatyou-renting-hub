// src/lib/fleetReminders.ts
// Resumen diario de vencimientos de SOAT / Tecnomecánica de la flota (Issue #15).
// Lee las vigencias directamente de `vehicles` (no de `reminder_subscriptions`, que es pública).
import { supabase } from "./supabase";
import { sendEmail } from "./email";

/** Días de anticipación (mismos defaults que las suscripciones públicas) */
export const FLEET_DAYS_BEFORE_SOAT = 15;
export const FLEET_DAYS_BEFORE_TECNO = 10;

/** Horas locales (Colombia) en las que se envía: corrida de la mañana, tolerante a retrasos del cron */
const FLEET_SEND_HOURS = [5, 6, 7, 8, 9];

type FleetItem = {
  plate: string;
  kind: "SOAT" | "Tecnomecánica";
  expires: string; // YYYY-MM-DD
  daysLeft: number; // negativo = vencido
};

export type FleetReminderResult = {
  skipped?: string;
  recipients?: number;
  items?: number;
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

function ymd(value: unknown): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ""));
  return m ? m[1]! : null;
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

/**
 * Envía el resumen de vencimientos de la flota.
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

  if (items.length === 0) return { recipients: recipients.length, items: 0, sent: 0 };

  items.sort((a, b) => a.daysLeft - b.daysLeft || a.plate.localeCompare(b.plate));
  const expired = items.filter((i) => i.daysLeft < 0);
  const upcoming = items.filter((i) => i.daysLeft >= 0);

  const line = (i: FleetItem) => `• ${i.plate} — ${i.kind}: ${describe(i)}`;
  const text =
    `Resumen de vencimientos de la flota (${todayStr}):\n\n` +
    (expired.length ? `VENCIDOS (${expired.length}):\n${expired.map(line).join("\n")}\n\n` : "") +
    (upcoming.length
      ? `PRÓXIMOS A VENCER (${upcoming.length}):\n${upcoming.map(line).join("\n")}\n\n`
      : "") +
    `Al pagar la renovación, regístrala en Gastos (/expenses) para actualizar la ficha del vehículo.`;
  const subject = `Flota AllAtYou: ${expired.length} vencido(s), ${upcoming.length} por vencer`;

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
  return { recipients: recipients.length, items: items.length, sent, errors };
}
