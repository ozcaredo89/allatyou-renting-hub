// src/lib/env.ts
// Registro único de variables de entorno del API (Issue #18).
// Toda variable que use el código DEBE estar declarada aquí: el CI (scripts/check-env.js) lo verifica.
// - required: si falta en Railway, el API no arranca y el deploy no reemplaza producción.
// - optional: tiene default o la funcionalidad se apaga de forma controlada.
// Spec: docs/specs/variables-entorno.md

export type EnvVar = { name: string; required: boolean; description: string };

export const ENV_VARS: EnvVar[] = [
  // Base de datos y auth
  { name: "SUPABASE_URL", required: true, description: "URL del proyecto Supabase" },
  { name: "SUPABASE_SERVICE_ROLE", required: true, description: "Llave service-role de Supabase" },
  { name: "ADMIN_BASIC_USER", required: true, description: "Usuario Basic Auth del admin" },
  { name: "ADMIN_BASIC_PASS", required: true, description: "Clave Basic Auth del admin" },
  { name: "LEGACY_BASIC_AUTH_UNTIL", required: false, description: "Último día (YYYY-MM-DD) del acceso genérico (default 2026-11-22)" },
  { name: "GOOGLE_CLIENT_ID", required: false, description: "OAuth Client ID de Google (login con Google; sin él se oculta)" },
  { name: "ADMIN_SIGNUP_NOTIFY_EMAIL", required: false, description: "Correo que recibe el aviso de usuarios nuevos" },
  { name: "ADMIN_WEB_URL", required: false, description: "URL del panel para enlaces de recuperación (default https://web.allatyou.com)" },

  // Almacenamiento (Cloudflare R2)
  { name: "R2_ENDPOINT", required: true, description: "Endpoint S3 de R2" },
  { name: "R2_ACCESS_KEY_ID", required: true, description: "Access key de R2" },
  { name: "R2_SECRET_ACCESS_KEY", required: true, description: "Secret key de R2" },
  { name: "R2_BUCKET_NAME", required: true, description: "Bucket de R2" },
  { name: "R2_PUBLIC_URL", required: true, description: "URL pública del bucket" },

  // Notificaciones
  { name: "ALLATYOU_RESEND_API_KEY", required: true, description: "API key de Resend (correo)" },
  { name: "ALLATYOU_RESEND_FROM", required: true, description: "Remitente de Resend" },
  { name: "TWILIO_ACCOUNT_SID", required: true, description: "Twilio (WhatsApp)" },
  { name: "TWILIO_AUTH_TOKEN", required: true, description: "Twilio (WhatsApp)" },
  { name: "TWILIO_WHATSAPP_FROM", required: true, description: "Número remitente de WhatsApp" },
  { name: "REMINDERS_INTERNAL_SECRET", required: true, description: "Secreto de POST /reminders/run" },
  { name: "FLEET_REMINDER_EMAILS", required: true, description: "Destinatarios del resumen de vencimientos de flota (coma)" },

  // IA
  { name: "GEMINI_API_KEY", required: true, description: "Gemini (OCR de comprobantes y SOAT)" },
  { name: "OPENAI_API_KEY", required: true, description: "OpenAI (clasificación de comprobantes)" },
  { name: "DEEPSEEK_API_KEY", required: false, description: "DeepSeek (proveedor alterno de IA)" },

  // Integraciones
  { name: "PROTRACK_ACCOUNT", required: true, description: "Cuenta Protrack (GPS)" },
  { name: "PROTRACK_PASSWORD", required: true, description: "Clave Protrack (GPS)" },
  { name: "TALLERPRO_API_KEY", required: true, description: "API key de TallerPro" },
  { name: "TALLERPRO_API_URL", required: false, description: "URL de TallerPro (tiene default)" },

  // Servidor
  { name: "PORT", required: false, description: "Puerto HTTP (Railway lo inyecta)" },
  { name: "WEB_ORIGIN", required: false, description: "Orígenes CORS extra (coma)" },
  { name: "ORACLE_API_PORT", required: false, description: "Puerto del API del Oráculo (default 3005)" },
];

/** true cuando corre en Railway o con NODE_ENV=production */
export function isProduction(): boolean {
  return Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) || process.env.NODE_ENV === "production";
}

export function missingRequiredEnv(): string[] {
  return ENV_VARS.filter((v) => v.required && !String(process.env[v.name] || "").trim()).map((v) => v.name);
}

/**
 * Valida variables al arrancar. En producción, si falta alguna requerida, termina el proceso:
 * el healthcheck de Railway falla y el deploy anterior sigue sirviendo. En local solo advierte.
 */
export function validateEnvOrExit(): void {
  const missing = missingRequiredEnv();
  if (missing.length === 0) return;

  const detail = missing
    .map((n) => `  - ${n}: ${ENV_VARS.find((v) => v.name === n)?.description || ""}`)
    .join("\n");

  if (isProduction()) {
    console.error(`❌ [env] Faltan variables de entorno requeridas. El API no arranca:\n${detail}`);
    process.exit(1);
  }
  console.warn(`⚠️ [env] Faltan variables de entorno (en producción el API no arrancaría):\n${detail}`);
}
