// src/routes/reminders.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { sendEmail } from "../lib/email";
import { sendWhatsApp } from "../lib/whatsapp";

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
  return Math.round((da - db) / MS_PER_DAY);
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

function parseYmdLocalDate(ymd: string): Date {
  const parts = ymd.split("-");
  if (parts.length !== 3) {
    throw new Error(`Invalid YYYY-MM-DD date: ${ymd}`);
  }

  const yy = Number(parts[0]);
  const mm = Number(parts[1]);
  const dd = Number(parts[2]);

  if (!Number.isInteger(yy) || !Number.isInteger(mm) || !Number.isInteger(dd)) {
    throw new Error(`Invalid YYYY-MM-DD date: ${ymd}`);
  }

  return new Date(yy, mm - 1, dd);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isWithinReminderWindow(
  todayLocal: Date,
  expiresYmd: string,
  daysBefore: number
): boolean {
  const expires = startOfDay(parseYmdLocalDate(expiresYmd));
  const today = startOfDay(todayLocal);
  const start = addDays(expires, -Math.max(0, daysBefore));

  // Ventana inclusiva: desde (vence - díasPrevios) hasta (vence)
  return (
    today.getTime() >= start.getTime() && today.getTime() <= expires.getTime()
  );
}

function truncate(s: string, max = 300): string {
  const str = String(s || "");
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
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
 * GET /reminders/log?plate=ABC123&limit=100
 * Seguridad: opcionalmente pon x-internal-secret o un token admin.
 */
r.get("/log", async (req: Request, res: Response) => {
  try {
    const plateRaw = String(req.query.plate || "").trim();
    const plate = plateRaw ? normalizePlate(plateRaw) : "";
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 1000)));

    let q = supabase
      .from("reminder_delivery_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (plate) q = q.eq("plate", plate);

    const { data, error } = await q;

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ items: data || [] });
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
      return res.status(400).json({ error: "days_before_* must be >= 0" });
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
        typeof notification_email === "string" && notification_email.trim()
          ? notification_email.trim()
          : null,
      notification_whatsapp:
        typeof notification_whatsapp === "string" && notification_whatsapp.trim()
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
 * Envía recordatorios a todas las suscripciones activas que coincidan
 * con la hora actual, y tengan al menos un canal (email o whatsapp).
 *
 * Reglas:
 *  - SOAT/Tecno solo envían si hoy está en la ventana:
 *    today ∈ [expires_at - days_before, expires_at]
 *  - Pico y Placa: diario (cuando coincide la hora).
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
    // Hora local fija para Colombia (UTC-5)
    // Railway y Node usan UTC internamente, así que ajustamos manualmente.
    const nowUtc = new Date();
    const nowLocal = new Date(nowUtc.getTime() - 5 * 60 * 60 * 1000); // UTC-5

    const currentHour = nowLocal.getHours(); // 0–23, hora de Colombia
    const todayStr = nowLocal.toISOString().slice(0, 10); // YYYY-MM-DD según día local

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

    let sentEmailCount = 0;
    let sentWhatsAppCount = 0;

    const skippedNoContact: string[] = [];
    const errorsOut: {
      plate: string;
      channel: "email" | "whatsapp";
      error: string;
    }[] = [];

    for (const sub of rows) {
      const emailTo = (sub.notification_email || "").trim();
      const waTo = (sub.notification_whatsapp || "").trim();

      if (!emailTo && !waTo) {
        skippedNoContact.push(sub.plate);
        continue;
      }

      const reasons: string[] = [];

      // SOAT
      if (sub.notify_soat && sub.soat_notify_hour === currentHour) {
        if (sub.soat_expires_at) {
          const ok = isWithinReminderWindow(
            nowLocal,
            sub.soat_expires_at,
            sub.days_before_soat ?? 0
          );
          if (ok) {
            const d = parseYmdLocalDate(sub.soat_expires_at);
            reasons.push(`SOAT (vence el ${d.toLocaleDateString("es-CO")})`);
          }
        } else {
          // Si no hay fecha, este reason podría spamear.
          // Mantengo tu comportamiento previo (sí envía), pero si prefieres, cámbialo a "no enviar".
          reasons.push("SOAT");
        }
      }

      // Tecno
      if (sub.notify_tecno && sub.tecno_notify_hour === currentHour) {
        if (sub.tecno_expires_at) {
          const ok = isWithinReminderWindow(
            nowLocal,
            sub.tecno_expires_at,
            sub.days_before_tecno ?? 0
          );
          if (ok) {
            const d = parseYmdLocalDate(sub.tecno_expires_at);
            reasons.push(
              `Tecnomecánico (vence el ${d.toLocaleDateString("es-CO")})`
            );
          }
        } else {
          reasons.push("Tecnomecánico");
        }
      }

      // Pico y Placa (v0: diario)
      if (sub.notify_pico && sub.pico_notify_hour === currentHour) {
        reasons.push("Pico y Placa");
      }

      if (!reasons.length) continue;

      const reasonTypes: string[] = [];
      if (reasons.some((r) => r.startsWith("SOAT"))) reasonTypes.push("soat");
      if (reasons.some((r) => r.startsWith("Tecnomecánico"))) reasonTypes.push("tecno");
      if (reasons.some((r) => r.startsWith("Pico"))) reasonTypes.push("pico");

      const landingUrl = new URL("https://www.allatyou.com/");
      landingUrl.searchParams.set("plate", sub.plate);
      landingUrl.searchParams.set("focus", "reminders");
      landingUrl.hash = "pico-placa";
      const manageUrl = landingUrl.toString();

      const subject = `Recordatorio diario – placa ${sub.plate}`;

      // Email body
      const emailTextLines: string[] = [
        `Hola,`,
        ``,
        `Este es tu recordatorio diario de AllAtYou Renting para la placa ${sub.plate}.`,
        ``,
        `Tienes activos recordatorios para:`,
        `• ${reasons.join("\n• ")}`,
        ``,
        `Recibirás este correo una vez al día a esta hora mientras los recordatorios estén activos.`,
        ``,
        `Si ya no quieres recibir estos correos, puedes actualizar o desactivar tus recordatorios aquí:`,
        manageUrl,
        ``,
        `Fecha de envío: ${todayStr}.`,
        ``,
        `— AllAtYou Renting`,
      ];

      // WhatsApp body
      const waBody =
        `AllAtYou Renting – placa ${sub.plate}\n` +
        `Recordatorio:\n• ${reasons.join("\n• ")}\n\n` +
        `Gestiona tus recordatorios aquí:\n${manageUrl}\n\n` +
        `Enviado: ${todayStr}\n\n` +
        `— Responde "Gracias" para seguir recibiendo estos mensajes.`;

      // Enviar Email (si existe)
      if (emailTo) {
        try {
          await sendEmail({
            to: emailTo,
            subject,
            text: emailTextLines.join("\n"),
          });

          await supabase.from("reminder_delivery_log").insert({
            plate: sub.plate,
            subscription_id: sub.id,
            channel: "email",
            to_value: emailTo,
            reason_types: reasonTypes,
            subject,
            body_preview: truncate(emailTextLines.join("\n")),
            status: "sent",
            run_id: `${todayStr}-${currentHour}`,
            run_hour: currentHour,
            run_date: todayStr,
          });

          sentEmailCount++;
        } catch (e: any) {

          const errMsg = `${e?.name || "Error"} ${e?.code || ""} ${e?.message || ""}`.trim();

          await supabase.from("reminder_delivery_log").insert({
            plate: sub.plate,
            subscription_id: sub.id,
            channel: "email",
            to_value: emailTo,
            reason_types: reasonTypes,
            subject,
            body_preview: truncate(emailTextLines.join("\n")),
            status: "error",
            error_message: truncate(errMsg, 500),
            run_id: `${todayStr}-${currentHour}`,
            run_hour: currentHour,
            run_date: todayStr,
          });

          console.error("sendEmail error for plate", sub.plate, e);
          errorsOut.push({
            plate: sub.plate,
            channel: "email",
            error: errMsg,
          });
        }
      }

      // Enviar WhatsApp (si existe)
      if (waTo) {
        try {
          await sendWhatsApp({
            to: waTo,
            body: waBody,
          });
          sentWhatsAppCount++;
        } catch (e: any) {
          console.error("sendWhatsApp error for plate", sub.plate, e);
          errorsOut.push({
            plate: sub.plate,
            channel: "whatsapp",
            error: `${e?.name || "Error"} ${e?.code || ""} ${e?.message || ""}`.trim(),
          });
        }
      }
    }

    return res.json({
      now: nowLocal.toISOString(),
      currentHour,
      totalMatched: rows.length,
      sentEmailCount,
      sentWhatsAppCount,
      skippedNoContactCount: skippedNoContact.length,
      errors: errorsOut,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

export default r;
