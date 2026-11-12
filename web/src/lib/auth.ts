// web/src/lib/auth.ts
// Credenciales del panel admin (Issue #49, spec docs/specs/usuarios-auth.md).
// `ensureBasicAuth()` sigue devolviendo el valor del header Authorization para que las
// páginas existentes no cambien:
//   - "Bearer <token>" si hay sesión de usuario personal (localStorage, 30 días).
//   - "Basic ..."      si se entró con el acceso genérico (sessionStorage, se retira pronto).
// Sin credenciales, redirige a /login.

const SESSION_KEY = "aay_session";
const USER_KEY = "aay_user";
const LEGACY_KEY = "ba";

export const API_URL = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  has_password: boolean;
  has_google: boolean;
};

export type AuthConfig = { googleClientId: string | null; legacyUntil: string; legacyActive: boolean };

function safeGet(store: Storage, key: string): string | null {
  try { return store.getItem(key); } catch { return null; }
}

export function getSessionToken(): string | null {
  return safeGet(localStorage, SESSION_KEY);
}

export function getSessionUser(): SessionUser | null {
  const raw = safeGet(localStorage, USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as SessionUser; } catch { return null; }
}

export function getLegacyHeader(): string | null {
  return safeGet(sessionStorage, LEGACY_KEY);
}

export function getAuthMode(): "session" | "legacy" | null {
  if (getSessionToken()) return "session";
  if (getLegacyHeader()) return "legacy";
  return null;
}

export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Al pasar a usuario personal se olvida el acceso genérico
  sessionStorage.removeItem(LEGACY_KEY);
}

export function setLegacy(user: string, pass: string): string {
  const header = "Basic " + btoa(`${user}:${pass}`);
  sessionStorage.setItem(LEGACY_KEY, header);
  return header;
}

export function loginRedirectUrl(): string {
  const next = window.location.pathname + window.location.search;
  return `/login?next=${encodeURIComponent(next)}`;
}

// Devuelve el header Authorization (sesión personal o genérico). Sin credenciales → /login.
export function ensureBasicAuth(): string {
  const token = getSessionToken();
  if (token) return `Bearer ${token}`;
  const legacy = getLegacyHeader();
  if (legacy) return legacy;
  if (!window.location.pathname.startsWith("/login")) window.location.href = loginRedirectUrl();
  throw new Error("Auth required");
}

// Elimina las credenciales guardadas (las páginas lo llaman cuando el server responde 401/403)
export function clearBasicAuth(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(LEGACY_KEY);
}

export async function logout(): Promise<void> {
  const token = getSessionToken();
  if (token) {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch { /* igual se limpia local */ }
  }
  clearBasicAuth();
}

// Helper de fetch que añade Authorization automáticamente
export async function requestWithBasicAuth(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = ensureBasicAuth();
  const headers = new Headers(init.headers || {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", token);
  }
  return fetch(input, { ...init, headers });
}

// ---------------- Llamadas a /auth ----------------

export async function authPost<T>(path: string, body: unknown, authorization?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorization) headers.Authorization = authorization;
  const res = await fetch(`${API_URL}/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.message || `Error ${res.status}`);
  return data as T;
}

let configPromise: Promise<AuthConfig> | null = null;
export function getAuthConfig(): Promise<AuthConfig> {
  if (!configPromise) {
    configPromise = fetch(`${API_URL}/auth/config`)
      .then((r) => r.json())
      .catch(() => ({ googleClientId: null, legacyUntil: "2026-11-22", legacyActive: true }));
  }
  return configPromise;
}

/** Días calendario (hora Colombia) que faltan para el retiro del acceso genérico. 0 = hoy es el último día. */
export function daysUntil(dateYmd: string): number {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const diff = (Date.parse(`${dateYmd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return Math.max(0, Math.round(diff));
}

export function daysLabel(days: number): string {
  return days <= 0 ? "hoy es el último día" : days === 1 ? "queda 1 día" : `quedan ${days} días`;
}

export function formatDateEs(dateYmd: string): string {
  return new Date(`${dateYmd}T12:00:00-05:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}
