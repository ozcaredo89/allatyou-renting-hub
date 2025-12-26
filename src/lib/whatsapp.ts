// src/lib/whatsapp.ts
import twilio from "twilio";

type SendWhatsAppArgs = {
  to: string;      // E164: +57300...
  body: string;    // mensaje
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeE164(raw: string): string {
  // Acepta: "311...", "57311...", "+57311..."
  // Devuelve: "+57311..."
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) throw new Error("Invalid phone number");

  // Si ya viene con 57 (Colombia) y longitud razonable
  if (digits.startsWith("57")) return `+${digits}`;

  // Si viene como móvil colombiano sin indicativo (10 dígitos típico: 3xxxxxxxxx)
  // lo asumimos Colombia
  if (digits.length === 10 && digits.startsWith("3")) return `+57${digits}`;

  // Si ya viene con indicativo pero sin +
  if (digits.length >= 11) return `+${digits}`;

  // Caso raro: no asumimos
  throw new Error("Phone number must be E.164 or a valid CO mobile");
}

export async function sendWhatsApp({ to, body }: SendWhatsAppArgs) {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const from = requireEnv("TWILIO_WHATSAPP_FROM"); // ej: +14155238886 (sandbox)

  const client = twilio(accountSid, authToken);

  const toE164 = normalizeE164(to);
  const fromE164 = normalizeE164(from);

  return client.messages.create({
    from: `whatsapp:${fromE164}`,
    to: `whatsapp:${toE164}`,
    body,
  });
}
