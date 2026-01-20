// src/routes/reminders.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { sendEmail } from "../lib/email";
import { sendWhatsApp } from "../lib/whatsapp";

const r = Router();
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

// =====================================================================
// 1. CONFIGURACIÓN DE PICO Y PLACA (CALI - ROTACIÓN ACTUALIZADA)
// =====================================================================
// Mapeo: Dígito final -> Día de la semana (1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie)
// Lógica aplicada: Rotación movida un día adelante respecto al ciclo anterior.
const PICO_PDAY: Record<number, number> = {
  1: 1, 2: 1, // Lunes
  3: 2, 4: 2, // Martes
  5: 3, 6: 3, // Miércoles
  7: 4, 8: 4, // Jueves
  9: 5, 0: 5, // Viernes
};

type ReminderRow = {
  id: number;
  plate: string;
  notify_soat: boolean;
  notify_tecno: boolean;
  notify_pico: boolean;
  days_before_soat: number;
  days_before_tecno: number;
  soat_notify_hour: number;
  tecno_notify_hour: number;
  pico_notify_hour: number;
  notification_email: string | null;
  notification_whatsapp: string | null;
  soat_expires_at: string | null;
  tecno_expires_at: string | null;
  city: string | null;
  active: boolean;
};

// =====================================================================
// 2. HELPERS
// =====================================================================

function normalizePlate(raw: unknown): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function normalizeDateOrNull(value: unknown, fieldName: string): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`invalid date format for ${fieldName}, expected YYYY-MM-DD`);
  }
  return s;
}

function parseYmdLocalDate(ymd: string): Date {
  const parts = ymd.split("-");
  if (parts.length !== 3) throw new Error(`Invalid YYYY-MM-DD date: ${ymd}`);
  const yy = Number(parts[0]);
  const mm = Number(parts[1]);
  const dd = Number(parts[2]);
  return new Date(yy, mm - 1, dd);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isWithinReminderWindow(todayLocal: Date, expiresYmd: string, daysBefore: number): boolean {
  const expires = startOfDay(parseYmdLocalDate(expiresYmd));
  const today = startOfDay(todayLocal);
  const start = addDays(expires, -Math.max(0, daysBefore));
  return today.getTime() >= start.getTime() && today.getTime() <= expires.getTime();
}

function truncate(s: string, max = 300): string {
  const str = String(s || "");
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// =====================================================================
// 3. RUTAS ESTÁTICAS Y DE GESTIÓN (Deben ir PRIMERO)
// =====================================================================

/**
 * GET /reminders/log
 * Devuelve el historial de envíos.
 * IMPORTANTE: Está antes de /:plate para evitar que "log" se interprete como placa.
 */
r.get("/log", async (req: Request, res: Response) => {
  try {
    const plateRaw = String(req.query.plate || "").trim();
    const plate = plateRaw ? normalizePlate(plateRaw) : "";
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));

    let q = supabase
      .from("reminder_delivery_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (plate) q = q.eq("plate", plate);
    if (req.query.channel) q = q.eq("channel", req.query.channel);
    if (req.query.status) q = q.eq("status", req.query.status);

    const { data, error } = await q;

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ items: data || [] });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

/**
 * POST /reminders/run
 * Ejecuta el envío masivo (Cron Job).
 * Verifica hora Y día de la semana para Pico y Placa.
 */
r.post("/run", async (req: Request, res: Response) => {
  const secretHeader = (req.headers["x-internal-secret"] || "") as string;
  const expectedSecret = process.env.REMINDERS_INTERNAL_SECRET;

  if (!expectedSecret || secretHeader !== expectedSecret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    // Calcular hora local Colombia (UTC-5)
    const nowUtc = new Date();
    const nowLocal = new Date(nowUtc.getTime() - 5 * 60 * 60 * 1000); 
    
    const currentHour = nowLocal.getHours();
    const currentDayOfWeek = nowLocal.getDay(); // 0=Dom, 1=Lun ... 5=Vie
    const todayStr = nowLocal.toISOString().slice(0, 10);

    // Buscar suscripciones activas que tengan algo configurado para ESTA hora
    const orParts = [
      `and(notify_soat.eq.true,soat_notify_hour.eq.${currentHour})`,
      `and(notify_tecno.eq.true,tecno_notify_hour.eq.${currentHour})`,
      `and(notify_pico.eq.true,pico_notify_hour.eq.${currentHour})`,
    ];

    const { data, error } = await supabase
      .from("reminder_subscriptions")
      .select("*")
      .eq("active", true)
      .or(orParts.join(","));

    if (error) return res.status(500).json({ error: error.message });

    const rows = (data || []) as ReminderRow[];
    let sentCount = 0;
    const errorsOut: any[] = [];

    for (const sub of rows) {
      const emailTo = (sub.notification_email || "").trim();
      const waTo = (sub.notification_whatsapp || "").trim();

      if (!emailTo && !waTo) continue;

      const reasons: string[] = [];

      // 1. Revisar SOAT
      if (sub.notify_soat && sub.soat_notify_hour === currentHour && sub.soat_expires_at) {
        if (isWithinReminderWindow(nowLocal, sub.soat_expires_at, sub.days_before_soat)) {
            const d = parseYmdLocalDate(sub.soat_expires_at);
            reasons.push(`SOAT (vence el ${d.toLocaleDateString("es-CO")})`);
        }
      }

      // 2. Revisar Tecnomecánica
      if (sub.notify_tecno && sub.tecno_notify_hour === currentHour && sub.tecno_expires_at) {
        if (isWithinReminderWindow(nowLocal, sub.tecno_expires_at, sub.days_before_tecno)) {
            const d = parseYmdLocalDate(sub.tecno_expires_at);
            reasons.push(`Tecnomecánica (vence el ${d.toLocaleDateString("es-CO")})`);
        }
      }

      // 3. Revisar Pico y Placa (LÓGICA CORREGIDA)
      // Solo alerta si es el día correcto de la semana
      if (sub.notify_pico && sub.pico_notify_hour === currentHour) {
        const lastChar = sub.plate.slice(-1);
        const lastDigit = parseInt(lastChar, 10);
        
        if (!isNaN(lastDigit)) {
            const expectedDay = PICO_PDAY[lastDigit];
            // Comparación estricta: Hoy vs Día asignado
            if (currentDayOfWeek === expectedDay) {
                reasons.push("Hoy tienes Pico y Placa en Cali.");
            }
        }
      }

      // Si no hay razones para notificar hoy, saltamos a la siguiente placa
      if (reasons.length === 0) continue;

      // Construir mensaje
      const manageUrl = `https://www.allatyou.com/?plate=${sub.plate}&focus=reminders#pico-placa`;
      const subject = `Recordatorio AllAtYou – ${sub.plate}`;
      const bodyText = 
        `Hola, recordatorio para la placa ${sub.plate}:\n\n` +
        reasons.map(r => `• ${r}`).join("\n") + 
        `\n\nGestionar alertas: ${manageUrl}`;

      // Enviar Email
      if (emailTo) {
        try {
            await sendEmail({ to: emailTo, subject, text: bodyText });
            await logDelivery(sub, "email", emailTo, reasons, "sent", todayStr, currentHour);
            sentCount++;
        } catch (e: any) {
            await logDelivery(sub, "email", emailTo, reasons, "error", todayStr, currentHour, e.message);
            errorsOut.push({ plate: sub.plate, channel: "email", error: e.message });
        }
      }

      // Enviar WhatsApp
      if (waTo) {
        try {
            await sendWhatsApp({ to: waTo, body: bodyText });
            sentCount++; // (Opcional: descomentar logDelivery si quieres guardar log de WA también)
        } catch (e: any) {
            errorsOut.push({ plate: sub.plate, channel: "whatsapp", error: e.message });
        }
      }
    }

    return res.json({ 
        date: todayStr, 
        hour: currentHour, 
        checked: rows.length, 
        sent: sentCount,
        errors: errorsOut 
    });

  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

// Helper interno para loguear en base de datos
async function logDelivery(sub: ReminderRow, channel: string, to: string, reasons: string[], status: string, date: string, hour: number, errorMsg?: string) {
    const rTypes = [];
    if (reasons.some(r => r.includes("SOAT"))) rTypes.push("soat");
    if (reasons.some(r => r.includes("Tecno"))) rTypes.push("tecno");
    if (reasons.some(r => r.includes("Pico"))) rTypes.push("pico");

    await supabase.from("reminder_delivery_log").insert({
        plate: sub.plate,
        subscription_id: sub.id,
        channel,
        to_value: to,
        reason_types: rTypes,
        subject: "Recordatorio Automático",
        body_preview: truncate(reasons.join(", ")),
        status,
        error_message: errorMsg ? truncate(errorMsg) : null,
        run_id: `${date}-${hour}`,
        run_hour: hour,
        run_date: date
    });
}

/**
 * POST /reminders
 * Crear o Actualizar suscripción
 */
r.post("/", async (req: Request, res: Response) => {
  try {
    const { plate: rawPlate, ...rest } = req.body || {};
    const plate = normalizePlate(rawPlate);

    if (!PLATE_RE.test(plate)) {
      return res.status(400).json({ error: "invalid plate format (expected ABC123)" });
    }

    const checkHour = (h: any) => (typeof h === 'number' && h >= 0 && h <= 23) ? h : 18;

    const row = {
      plate,
      notify_soat: rest.notify_soat ?? true,
      notify_tecno: rest.notify_tecno ?? true,
      notify_pico: rest.notify_pico ?? false,
      days_before_soat: rest.days_before_soat || 15,
      days_before_tecno: rest.days_before_tecno || 10,
      soat_notify_hour: checkHour(rest.soat_notify_hour),
      tecno_notify_hour: checkHour(rest.tecno_notify_hour),
      pico_notify_hour: checkHour(rest.pico_notify_hour || 5), // 5am default pico y placa
      notification_email: rest.notification_email || null,
      notification_whatsapp: rest.notification_whatsapp || null,
      soat_expires_at: normalizeDateOrNull(rest.soat_expires_at, "soat"),
      tecno_expires_at: normalizeDateOrNull(rest.tecno_expires_at, "tecno"),
      city: rest.city || null,
      active: true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("reminder_subscriptions")
      .upsert(row, { onConflict: "plate" })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// 4. RUTAS DINÁMICAS (Deben ir AL FINAL)
// =====================================================================

/**
 * GET /reminders/:plate
 * Consulta suscripción individual.
 */
r.get("/:plate", async (req: Request, res: Response) => {
  try {
    const plateRaw = req.params.plate;
    const plate = normalizePlate(plateRaw);

    if (!PLATE_RE.test(plate)) {
      return res.status(400).json({ error: "invalid plate format" });
    }

    const { data, error } = await supabase
      .from("reminder_subscriptions")
      .select("*")
      .eq("plate", plate)
      .limit(1);

    if (error) return res.status(500).json({ error: error.message });

    const row = data && data[0];
    if (!row) return res.status(404).json({ error: "subscription not found" });

    return res.json(row);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

export default r;