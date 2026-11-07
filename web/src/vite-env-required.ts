// web/src/vite-env-required.ts
// Registro de variables VITE_* del frontend (Issue #18).
// - required: el build de producción (Vercel) falla si falta → no se publica.
// - optional: la funcionalidad se apaga de forma controlada.
// Lo leen vite.config.ts (validación del build) y scripts/check-env.js (CI).
// Spec: docs/specs/variables-entorno.md

export type WebEnvVar = { name: string; required: boolean; description: string };

export const WEB_ENV_VARS: WebEnvVar[] = [
  { name: "VITE_API_URL", required: true, description: "URL del API (Railway)" },
  { name: "VITE_GOOGLE_MAPS_API_KEY", required: false, description: "Google Maps (mapas de flota)" },
  { name: "VITE_PUBLIC_POSTHOG_KEY", required: false, description: "PostHog (analítica)" },
  { name: "VITE_PUBLIC_POSTHOG_HOST", required: false, description: "PostHog host" },
  { name: "VITE_TALLER_URL", required: false, description: "URL de la app del Taller" },
];
