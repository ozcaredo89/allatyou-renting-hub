// src/routes/emailTest.ts
import { Router, Request, Response } from "express";
import { sendEmail } from "../lib/email";

const r = Router();

/**
 * POST /internal/email-test
 * Header: x-internal-secret: <REMINDERS_INTERNAL_SECRET>
 * Body opcional: { "to": "tu_correo@ejemplo.com" }
 */
r.post("/email-test", async (req: Request, res: Response) => {
  try {
    const secret = req.headers["x-internal-secret"];
    if (!secret || secret !== process.env.REMINDERS_INTERNAL_SECRET) {
      return res.status(403).json({ error: "forbidden" });
    }

    const body = (req.body || {}) as { to?: string };

    const to =
      (body.to && String(body.to).trim()) ||
      (process.env.SMTP_TEST_TO && process.env.SMTP_TEST_TO.trim()) ||
      (process.env.SMTP_FROM && process.env.SMTP_FROM.trim()) ||
      "";

    if (!to) {
      return res.status(400).json({
        error:
          "missing 'to' address. Send it in body.to or configure SMTP_TEST_TO / SMTP_FROM",
      });
    }

    await sendEmail({
      to,
      subject: "[AllAtYou] Prueba de recordatorios",
      text:
        "Este es un correo de prueba enviado desde AllAtYou Renting Hub para validar la configuración SMTP.",
      html:
        "<p>Este es un correo de <strong>prueba</strong> enviado desde AllAtYou Renting Hub para validar la configuración SMTP.</p>",
    });

    return res.json({ ok: true, to });
  } catch (err: any) {
    console.error("email-test error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "error sending test email" });
  }
});

export default r;
