// src/routes/whatsappTest.ts
import { Router, Request, Response } from "express";
import { sendWhatsApp } from "../lib/whatsapp";

const r = Router();

/**
 * POST /internal/whatsapp-test
 * Header: x-internal-secret: <REMINDERS_INTERNAL_SECRET>
 * Body: { "to": "+573001234567", "body"?: "texto opcional" }
 */
r.post("/whatsapp-test", async (req: Request, res: Response) => {
  try {
    const secret = req.headers["x-internal-secret"];
    if (!secret || secret !== process.env.REMINDERS_INTERNAL_SECRET) {
      return res.status(403).json({ error: "forbidden" });
    }

    const bodyReq = (req.body || {}) as { to?: string; body?: string };

    const to = bodyReq.to && String(bodyReq.to).trim();
    if (!to) {
      return res.status(400).json({
        error: "missing 'to' phone. Send it in body.to (E.164 or CO mobile)",
      });
    }

    const msg =
      (bodyReq.body && String(bodyReq.body)) ||
      "[AllAtYou] Mensaje de prueba por WhatsApp (Twilio Sandbox).";

    const tw = await sendWhatsApp({ to, body: msg });

    return res.json({ ok: true, sid: tw.sid, to, from: tw.from });
  } catch (err: any) {
    console.error("whatsapp-test error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "error sending test whatsapp" });
  }
});

export default r;
