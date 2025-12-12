// src/lib/email.ts
import nodemailer from "nodemailer";

type SendEmailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
  // Importante: log pero no romper el server
  console.warn(
    "[email] SMTP env vars not fully configured. Emails will fail until you set them."
  );
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 465), // Se cambio de 587 a 465 a ver si me deja pasar el firewall
  secure: true, // si puso true ahora que se cambio a de 587 a 465
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error("SMTP is not configured");
  }

  console.log("[sendEmail] Using SMTP config:", {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    from: SMTP_FROM,
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? `<pre>${opts.text}</pre>`,
  });
}
