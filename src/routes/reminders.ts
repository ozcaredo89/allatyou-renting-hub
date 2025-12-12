// src/routes/reminders.ts 
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { sendEmail } from "../lib/email"; 

const r = Router();
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

// Mapa simple de pico y placa (Cali)
const PICO_PDAY: Record<number, number> = {
  0: 4, // jueves
  1: 5, // viernes
  2: 5, // viernes
  3: 1, // lunes
  4: 1, // lunes
  5: 2, // martes
  6: 2, // martes
  7: 3, // miércoles
  8: 3, // miércoles
  9: 4, // jueves
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

/**
 * Normaliza placa a ABC123 (mayúsculas y solo A-Z0-9)
 */
function normalizePlate(raw: unknown): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffInDays(a: Date, b: Date): number {
  const da = startOfDay(a).getTime();
  const db = startOfDay(b).getTime();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/**
 * Valida y normaliza fechas YYYY-MM-DD (o null).
 * Si viene string vacío → null.
 * Si viene con formato inválido → lanza error.
 */
function normalizeDateOrNull(value: unknown, fieldName: string): string | null {
  if (value == null) return null;

  const s = String(value).trim();
  if (!s) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`invalid date format for ${fieldName}, expected YYYY-MM-DD`);
  }
  return s;
}

/**
 * GET /reminders/:plate
 * Devuelve la suscripción (si existe) para esa placa.
 */
r.get("/:plate", async (req: Request, res: Response) => {
  try {
    const plateRaw = req.params.plate;
    const plate = normalizePlate(plateRaw);

    if (!PLATE_RE.test(plate)) {
      return res
        .status(400)
        .json({ error: "invalid plate format (expected ABC123)" });
    }

    const { data, error } = await supabase
      .from("reminder_subscriptions")
      .select("*")
      .eq("plate", plate)
      .limit(1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const row = data && data[0];
    if (!row) {
      return res.status(404).json({ error: "subscription not found" });
    }

    return res.json(row);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

/**
 * POST /reminders
 * Crea o actualiza la suscripción para una placa (upsert por plate).
 *
 * body:
 * {
 *   plate: string,
 *   notify_soat?: boolean,
 *   notify_tecno?: boolean,
 *   notify_pico?: boolean,
 *   days_before_soat?: number,
 *   days_before_tecno?: number,
 *   soat_notify_hour?: number,
 *   tecno_notify_hour?: number,
 *   pico_notify_hour?: number,
 *   notification_email?: string | null,
 *   notification_whatsapp?: string | null,
 *   soat_expires_at?: string | null,   // YYYY-MM-DD
 *   tecno_expires_at?: string | null,  // YYYY-MM-DD
 *   city?: string | null
 * }
 */
r.post("/", async (req: Request, res: Response) => {
  try {
    const {
      plate: rawPlate,
      notify_soat,
      notify_tecno,
      notify_pico,
      days_before_soat,
      days_before_tecno,
      soat_notify_hour,
      tecno_notify_hour,
      pico_notify_hour,
      notification_email,
      notification_whatsapp,
      soat_expires_at,
      tecno_expires_at,
      city,
    } = req.body || {};

    const plate = normalizePlate(rawPlate);

    if (!PLATE_RE.test(plate)) {
      return res
        .status(400)
        .json({ error: "invalid plate format (expected ABC123)" });
    }

    // Validar y normalizar fechas (pueden ser null)
    let soatExpires: string | null = null;
    let tecnoExpires: string | null = null;
    try {
      soatExpires = normalizeDateOrNull(soat_expires_at, "soat_expires_at");
      tecnoExpires = normalizeDateOrNull(tecno_expires_at, "tecno_expires_at");
    } catch (e: any) {
      return res.status(400).json({ error: e.message || "invalid dates" });
    }

    // Normalizar ciudad (opcional)
    const cityNorm =
      typeof city === "string" && city.trim() ? city.trim() : null;

    // Aplicar defaults razonables si vienen undefined
    const daysBeforeSoat =
      typeof days_before_soat === "number" && Number.isFinite(days_before_soat)
        ? days_before_soat
        : 15;
    const daysBeforeTecno =
      typeof days_before_tecno === "number" &&
      Number.isFinite(days_before_tecno)
        ? days_before_tecno
        : 10;

    const soatHour =
      typeof soat_notify_hour === "number" && Number.isFinite(soat_notify_hour)
        ? soat_notify_hour
        : 18; // 6pm por defecto
    const tecnoHour =
      typeof tecno_notify_hour === "number" &&
      Number.isFinite(tecno_notify_hour)
        ? tecno_notify_hour
        : 18;
    const picoHour =
      typeof pico_notify_hour === "number" && Number.isFinite(pico_notify_hour)
        ? pico_notify_hour
        : 5; // 5am

    // Validaciones suaves en rango (para alinear con constraints de BD)
    if (
      soatHour < 0 ||
      soatHour > 23 ||
      tecnoHour < 0 ||
      tecnoHour > 23 ||
      picoHour < 0 ||
      picoHour > 23
    ) {
      return res
        .status(400)
        .json({ error: "notify hours must be between 0 and 23" });
    }

    if (daysBeforeSoat < 0 || daysBeforeTecno < 0) {
      return res
        .status(400)
        .json({ error: "days_before_* must be >= 0" });
    }

    const row = {
      plate,
      notify_soat: typeof notify_soat === "boolean" ? notify_soat : true,
      notify_tecno: typeof notify_tecno === "boolean" ? notify_tecno : true,
      notify_pico: typeof notify_pico === "boolean" ? notify_pico : false,

      days_before_soat: daysBeforeSoat,
      days_before_tecno: daysBeforeTecno,

      soat_notify_hour: soatHour,
      tecno_notify_hour: tecnoHour,
      pico_notify_hour: picoHour,

      soat_expires_at: soatExpires,
      tecno_expires_at: tecnoExpires,
      city: cityNorm,

      notification_email:
        typeof notification_email === "string" &&
        notification_email.trim()
          ? notification_email.trim()
          : null,
      notification_whatsapp:
        typeof notification_whatsapp === "string" &&
        notification_whatsapp.trim()
          ? notification_whatsapp.trim()
          : null,

      active: true, // por ahora siempre activa al guardar/actualizar
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("reminder_subscriptions")
      .upsert(row, { onConflict: "plate" })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

/**
 * POST /reminders/run
 *
 * Ejecutado por GitHub Actions (cron).
 * Envia recordatorios DIARIOS por correo electrónico a todas las
 * suscripciones activas que coincidan con la hora actual y tengan email.
 *
 * Se detiene automáticamente cuando:
 *  - el usuario desactiva el flag correspondiente (notify_* = false), o
 *  - se marca la suscripción como inactive (active = false).
 *
 * Seguridad:
 *   Requiere header x-internal-secret == REMINDERS_INTERNAL_SECRET (env).
 */
r.post("/run", async (req: Request, res: Response) => {
  const secretHeader = (req.headers["x-internal-secret"] || "") as string;
  const expectedSecret = process.env.REMINDERS_INTERNAL_SECRET;

  if (!expectedSecret || secretHeader !== expectedSecret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const now = new Date();
    const currentHour = now.getHours(); // 0–23, el cron se programa según esto
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Traemos solo suscripciones activas que "aplican" en esta hora
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

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const rows = (data || []) as ReminderRow[];

    let sentCount = 0;
    const skippedNoEmail: string[] = [];
    const errors: { plate: string; error: string }[] = [];

    for (const sub of rows) {
      const to = (sub.notification_email || "").trim();
      if (!to) {
        skippedNoEmail.push(sub.plate);
        continue;
      }

      const reasons: string[] = [];

      if (sub.notify_soat && sub.soat_notify_hour === currentHour) {
        if (sub.soat_expires_at) {
          const d = new Date(sub.soat_expires_at);
          reasons.push(
            `SOAT (vence el ${d.toLocaleDateString("es-CO")})`
          );
        } else {
          reasons.push("SOAT");
        }
      }

      if (sub.notify_tecno && sub.tecno_notify_hour === currentHour) {
        if (sub.tecno_expires_at) {
          const d = new Date(sub.tecno_expires_at);
          reasons.push(
            `Tecnomecánico (vence el ${d.toLocaleDateString("es-CO")})`
          );
        } else {
          reasons.push("Tecnomecánico");
        }
      }

      if (sub.notify_pico && sub.pico_notify_hour === currentHour) {
        // Para v0: recordatorio diario genérico de pico y placa
        reasons.push("Pico y Placa");
      }

      if (!reasons.length) {
        // Por seguridad, aunque en teoría siempre habrá alguna razón
        continue;
      }

      const subject = `Recordatorio diario – placa ${sub.plate}`;
      const textLines: string[] = [
        `Hola,`,
        ``,
        `Este es tu recordatorio diario de AllAtYou Renting para la placa ${sub.plate}.`,
        ``,
        `Tienes activos recordatorios para:`,
        `• ${reasons.join("\n• ")}`,
        ``,
        `Recibirás este correo una vez al día a esta hora mientras los recordatorios estén activos.`,
        `Si ya no quieres recibirlos, puedes actualizar tus preferencias desde la sección de`,
        `pico y placa / recordatorios en la página:`,
        `https://www.allatyou.com#pico-placa`,
        ``,
        `Fecha de envío: ${todayStr}.`,
        ``,
        `— AllAtYou Renting`,
      ];

      try {
        await sendEmail({
          to,
          subject,
          text: textLines.join("\n"),
        });
        sentCount++;
      } catch (e: any) {
        errors.push({
          plate: sub.plate,
          error: e?.message || "sendEmail failed",
        });
      }
    }

    return res.json({
      now: now.toISOString(),
      currentHour,
      totalMatched: rows.length,
      sentCount,
      skippedNoEmailCount: skippedNoEmail.length,
      errors,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

export default r;
