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
 * Endpoint interno (para GitHub Actions / cron) que:
 * - Calcula qué recordatorios deben dispararse "ahora".
 * - Envía correos electrónicos reales usando sendEmail.
 *
 * Seguridad:
 *   Requiere header X-Internal-Secret == REMINDERS_INTERNAL_SECRET (env).
 */
r.post("/run", async (req: Request, res: Response) => {
  const secretHeader = (req.headers["x-internal-secret"] || "") as string;
  const expectedSecret = process.env.REMINDERS_INTERNAL_SECRET;

  if (!expectedSecret || secretHeader !== expectedSecret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    // "Ahora" (el cron lo vas a programar en las horas que tú quieras)
    const now = new Date();
    const currentHour = now.getHours(); // asume server en tu zona o ajustas el cron

    const today = startOfDay(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from("reminder_subscriptions")
      .select("*")
      .eq("active", true);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const rows = (data || []) as ReminderRow[];

    const sent = { soat: 0, tecno: 0, pico: 0 };
    const skippedNoEmail: string[] = [];
    const errors: { plate: string; kind: string; error: string }[] = [];

    for (const sub of rows) {
      const to = (sub.notification_email || "").trim();
      if (!to) {
        // No hay correo configurado → lo saltamos (en futuro WhatsApp)
        skippedNoEmail.push(sub.plate);
        continue;
      }

      const plate = sub.plate;
      const lastDigit = Number(plate.slice(-1));
      const soatDate = sub.soat_expires_at ? new Date(sub.soat_expires_at) : null;
      const tecnoDate = sub.tecno_expires_at ? new Date(sub.tecno_expires_at) : null;

      // SOAT
      if (sub.notify_soat && soatDate && sub.soat_notify_hour === currentHour) {
        const diff = diffInDays(soatDate, today);
        if (diff === sub.days_before_soat) {
          const subject = `Recordatorio: SOAT para ${plate} vence el ${soatDate.toLocaleDateString(
            "es-CO"
          )}`;
          const text =
            `Hola,\n\n` +
            `Te recordamos que el SOAT del vehículo con placa ${plate} vence el ` +
            `${soatDate.toLocaleDateString("es-CO")}.\n\n` +
            `Te recomendamos renovarlo con anticipación para evitar comparendos o inmovilización.\n\n` +
            `— AllAtYou Renting`;

          try {
            await sendEmail({ to, subject, text });
            sent.soat++;
          } catch (e: any) {
            errors.push({
              plate,
              kind: "soat",
              error: e?.message || "sendEmail failed",
            });
          }
        }
      }

      // TECNOMECÁNICO
      if (sub.notify_tecno && tecnoDate && sub.tecno_notify_hour === currentHour) {
        const diff = diffInDays(tecnoDate, today);
        if (diff === sub.days_before_tecno) {
          const subject = `Recordatorio: tecnomecánico para ${plate} vence el ${tecnoDate.toLocaleDateString(
            "es-CO"
          )}`;
          const text =
            `Hola,\n\n` +
            `Te recordamos que el tecnomecánico del vehículo con placa ${plate} vence el ` +
            `${tecnoDate.toLocaleDateString("es-CO")}.\n\n` +
            `Mantenerlo al día te ayuda a evitar comparendos y problemas mecánicos.\n\n` +
            `— AllAtYou Renting`;

          try {
            await sendEmail({ to, subject, text });
            sent.tecno++;
          } catch (e: any) {
            errors.push({
              plate,
              kind: "tecno",
              error: e?.message || "sendEmail failed",
            });
          }
        }
      }

      // PICO Y PLACA (recordatorio el día anterior)
      if (
        sub.notify_pico &&
        !Number.isNaN(lastDigit) &&
        sub.pico_notify_hour === currentHour
      ) {
        const picoDay = PICO_PDAY[lastDigit];
        if (picoDay != null && picoDay === tomorrow.getDay()) {
          const subject = `Recordatorio: mañana tienes pico y placa (${plate})`;
          const text =
            `Hola,\n\n` +
            `Te recordamos que mañana aplica pico y placa para el vehículo con placa ${plate}.\n` +
            `Tenlo en cuenta para planear tus recorridos y evitar comparendos.\n\n` +
            `— AllAtYou Renting`;

          try {
            await sendEmail({ to, subject, text });
            sent.pico++;
          } catch (e: any) {
            errors.push({
              plate,
              kind: "pico",
              error: e?.message || "sendEmail failed",
            });
          }
        }
      }
    }

    return res.json({
      now: now.toISOString(),
      currentHour,
      totalSubscriptions: rows.length,
      sent,
      skippedNoEmailCount: skippedNoEmail.length,
      errors,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

export default r;
