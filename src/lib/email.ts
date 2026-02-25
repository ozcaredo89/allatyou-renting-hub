// src/lib/email.ts
type SendEmailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

// Variables desde Railway
const RESEND_API_KEY = process.env.ALLATYOU_RESEND_API_KEY;
const RESEND_FROM = process.env.ALLATYOU_RESEND_FROM;

// Validación básica al iniciar el servidor
if (!RESEND_API_KEY || !RESEND_FROM) {
  console.warn("[email] RESEND_API_KEY o RESEND_FROM no están configurados.");
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (!RESEND_API_KEY || !RESEND_FROM) {
    throw new Error("Resend no está configurado correctamente.");
  }

  const body = {
    from: RESEND_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? `<pre>${opts.text}</pre>`,
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[Resend] Email failed:", errorBody);
    throw new Error(`Resend error: ${response.status} – ${errorBody}`);
  }

  console.log("[Resend] Email sent OK:", { to: opts.to, subject: opts.subject });
}
