// src/lib/adminAuth.ts
// Usuarios personales del panel admin (Issue #49). Spec: docs/specs/usuarios-auth.md
// - Contraseñas con scrypt (crypto nativo, sin dependencias).
// - Sesiones opacas: el cliente guarda un token aleatorio; en BD solo vive su sha256.
// - Login con Google: se valida el ID token contra Google (aud = GOOGLE_CLIENT_ID).
// - Acceso genérico (ADMIN_BASIC_USER/PASS) convive hasta LEGACY_BASIC_AUTH_UNTIL.
import crypto from "crypto";
import { supabase } from "./supabase";
import { sendEmail } from "./email";

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
  has_password: boolean;
  has_google: boolean;
  created_at: string;
  last_login_at: string | null;
};

const SESSION_DAYS = 30;
const RESET_MINUTES = 60;
const INVITE_HOURS = 72;
const DEFAULT_LEGACY_UNTIL = "2026-11-22";
const DEFAULT_NOTIFY_EMAIL = "oscar.hv89@gmail.com";
const DEFAULT_WEB_URL = "https://web.allatyou.com";

// ------------------------------------------------------------------
// Acceso genérico (legado)
// ------------------------------------------------------------------

/** Último día (inclusive, hora Colombia) en que se acepta el usuario/clave genérico. */
export function legacyUntil(): string {
  const v = String(process.env.LEGACY_BASIC_AUTH_UNTIL || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEFAULT_LEGACY_UNTIL;
}

export function isLegacyActive(now = new Date()): boolean {
  const end = new Date(`${legacyUntil()}T23:59:59-05:00`);
  return now.getTime() <= end.getTime();
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** true si el header Basic trae el usuario/clave genérico correcto. */
export function checkLegacyBasic(header: string): boolean {
  const expectedUser = process.env.ADMIN_BASIC_USER;
  const expectedPass = process.env.ADMIN_BASIC_PASS;
  if (!expectedUser || !expectedPass || !header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString();
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  return safeEqual(decoded.slice(0, idx), expectedUser) && safeEqual(decoded.slice(idx + 1), expectedPass);
}

// ------------------------------------------------------------------
// Contraseñas y tokens
// ------------------------------------------------------------------

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (pw.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(pw, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const newToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ------------------------------------------------------------------
// Usuarios
// ------------------------------------------------------------------

const USER_COLS = "id, email, full_name, avatar_url, status, password_hash, google_sub, created_at, last_login_at";

type UserRow = {
  id: string; email: string; full_name: string; avatar_url: string | null; status: string;
  password_hash: string | null; google_sub: string | null; created_at: string; last_login_at: string | null;
};

export function toPublicUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    status: row.status,
    has_password: Boolean(row.password_hash),
    has_google: Boolean(row.google_sub),
    created_at: row.created_at,
    last_login_at: row.last_login_at,
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await supabase.from("admin_users").select(USER_COLS).ilike("email", email).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserRow) || null;
}

export async function findUserByGoogleSub(sub: string): Promise<UserRow | null> {
  const { data, error } = await supabase.from("admin_users").select(USER_COLS).eq("google_sub", sub).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserRow) || null;
}

export async function createUser(input: {
  email: string; full_name: string; password_hash?: string | null; google_sub?: string | null;
  avatar_url?: string | null; created_via: string; created_by?: string | null;
}): Promise<UserRow> {
  const { data, error } = await supabase
    .from("admin_users")
    .insert({
      email: input.email,
      full_name: input.full_name,
      password_hash: input.password_hash ?? null,
      google_sub: input.google_sub ?? null,
      avatar_url: input.avatar_url ?? null,
      created_via: input.created_via,
      created_by: input.created_by ?? null,
    })
    .select(USER_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as UserRow;
}

export async function updateUser(id: string, patch: Record<string, unknown>): Promise<UserRow> {
  const { data, error } = await supabase
    .from("admin_users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(USER_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as UserRow;
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.from("admin_users").select(USER_COLS).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as UserRow[]).map(toPublicUser);
}

// ------------------------------------------------------------------
// Sesiones
// ------------------------------------------------------------------

// Caché corta para no consultar la BD en cada request del panel.
const sessionCache = new Map<string, { user: AdminUser; sessionId: string; until: number }>();
const CACHE_MS = 60_000;

export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  const { error } = await supabase.from("admin_sessions").insert({
    user_id: userId,
    token_hash: hashToken(token),
    user_agent: (userAgent || "").slice(0, 300),
    expires_at: expires,
  });
  if (error) throw new Error(error.message);
  await supabase.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", userId);
  return token;
}

export async function resolveSession(token: string): Promise<{ user: AdminUser; sessionId: string } | null> {
  const th = hashToken(token);
  const cached = sessionCache.get(th);
  if (cached && cached.until > Date.now()) return { user: cached.user, sessionId: cached.sessionId };

  const { data, error } = await supabase
    .from("admin_sessions")
    .select(`id, expires_at, revoked_at, admin_users ( ${USER_COLS} )`)
    .eq("token_hash", th)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as { id: string; expires_at: string; revoked_at: string | null; admin_users: UserRow | null };
  if (row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) return null;
  if (!row.admin_users || row.admin_users.status !== "active") return null;

  const user = toPublicUser(row.admin_users);
  sessionCache.set(th, { user, sessionId: row.id, until: Date.now() + CACHE_MS });
  // last_seen_at solo en cache miss (máx. 1 vez por minuto por sesión)
  void supabase.from("admin_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", row.id);
  return { user, sessionId: row.id };
}

export async function revokeSession(token: string): Promise<void> {
  const th = hashToken(token);
  sessionCache.delete(th);
  await supabase.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", th);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  for (const [k, v] of sessionCache) if (v.user.id === userId) sessionCache.delete(k);
  await supabase
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
}

// ------------------------------------------------------------------
// Recuperación de contraseña / invitaciones
// ------------------------------------------------------------------

export async function createResetToken(userId: string, minutes = RESET_MINUTES): Promise<string> {
  const token = newToken();
  const { error } = await supabase.from("admin_password_resets").insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

/** Consume el token (un solo uso). Devuelve el user_id o null si es inválido/vencido. */
export async function consumeResetToken(token: string): Promise<string | null> {
  const { data } = await supabase
    .from("admin_password_resets")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  const { data: updated } = await supabase
    .from("admin_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("used_at", null)
    .select("id");
  if (!updated || updated.length === 0) return null; // carrera: ya se usó
  return data.user_id as string;
}

export function webUrl(): string {
  return (process.env.ADMIN_WEB_URL || DEFAULT_WEB_URL).replace(/\/+$/, "");
}

export function resetLink(token: string): string {
  return `${webUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export { INVITE_HOURS };

// ------------------------------------------------------------------
// Google
// ------------------------------------------------------------------

export function googleClientId(): string | null {
  return String(process.env.GOOGLE_CLIENT_ID || "").trim() || null;
}

export type GoogleProfile = { sub: string; email: string; name: string; picture: string | null };

/** Valida el ID token de Google Identity Services con el endpoint tokeninfo de Google. */
export async function verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
  const clientId = googleClientId();
  if (!clientId) throw new Error("El login con Google no está configurado.");
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!r.ok) throw new Error("Token de Google inválido.");
  const info = (await r.json()) as Record<string, string>;
  if (info.aud !== clientId) throw new Error("Token de Google emitido para otra aplicación.");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(info.iss || "")) throw new Error("Emisor de token inválido.");
  if (Number(info.exp) * 1000 < Date.now()) throw new Error("Token de Google vencido.");
  if (info.email_verified !== "true" || !info.sub || !info.email) throw new Error("El correo de Google no está verificado.");
  return {
    sub: info.sub,
    email: normalizeEmail(info.email),
    name: info.name || info.email,
    picture: info.picture || null,
  };
}

// ------------------------------------------------------------------
// Correos
// ------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function notifyEmail(): string {
  return String(process.env.ADMIN_SIGNUP_NOTIFY_EMAIL || "").trim() || DEFAULT_NOTIFY_EMAIL;
}

/** Aviso al administrador cada vez que se crea un usuario. Nunca rompe el flujo. */
export async function notifyNewUser(user: AdminUser, method: string, createdBy: string): Promise<void> {
  const when = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
  const text =
    `Se creó un usuario en AllAtYou Admin.\n\n` +
    `Nombre: ${user.full_name}\nCorreo: ${user.email}\nMétodo: ${method}\nCreado por: ${createdBy}\nFecha: ${when}\n\n` +
    `Si no reconoces este usuario, desactívalo en la tabla admin_users (status = 'disabled').`;
  try {
    await sendEmail({
      to: notifyEmail(),
      subject: `Nuevo usuario en AllAtYou Admin: ${user.full_name}`,
      text,
      html: `<p>Se creó un usuario en <b>AllAtYou Admin</b>.</p><ul>
        <li><b>Nombre:</b> ${esc(user.full_name)}</li><li><b>Correo:</b> ${esc(user.email)}</li>
        <li><b>Método:</b> ${esc(method)}</li><li><b>Creado por:</b> ${esc(createdBy)}</li><li><b>Fecha:</b> ${esc(when)}</li></ul>
        <p style="color:#64748b">Si no reconoces este usuario, desactívalo en la tabla <code>admin_users</code> (status = 'disabled').</p>`,
    });
  } catch (e) {
    console.error("[adminAuth] No se pudo enviar el aviso de nuevo usuario:", e);
  }
}

function buttonHtml(href: string, label: string) {
  return `<p><a href="${esc(href)}" style="display:inline-block;background:#059669;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${esc(label)}</a></p>
    <p style="color:#64748b;font-size:12px">Si el botón no funciona, copia este enlace: ${esc(href)}</p>`;
}

export async function sendResetEmail(user: AdminUser, token: string): Promise<void> {
  const link = resetLink(token);
  await sendEmail({
    to: user.email,
    subject: "Recupera tu contraseña de AllAtYou Admin",
    text: `Hola ${user.full_name},\n\nPara crear una nueva contraseña abre este enlace (vence en ${RESET_MINUTES} minutos):\n${link}\n\nSi no lo pediste, ignora este correo.`,
    html: `<p>Hola ${esc(user.full_name)},</p><p>Para crear una nueva contraseña usa este botón (vence en ${RESET_MINUTES} minutos):</p>
      ${buttonHtml(link, "Crear nueva contraseña")}<p>Si no lo pediste, ignora este correo.</p>`,
  });
}

export async function sendInviteEmail(user: AdminUser, token: string, invitedBy: string): Promise<void> {
  const link = resetLink(token);
  await sendEmail({
    to: user.email,
    subject: "Tienes acceso a AllAtYou Admin",
    text: `Hola ${user.full_name},\n\n${invitedBy} te dio acceso a AllAtYou Admin.\n` +
      `Entra con Google usando ${user.email} en ${webUrl()}/login o crea tu contraseña aquí (vence en ${INVITE_HOURS} horas):\n${link}`,
    html: `<p>Hola ${esc(user.full_name)},</p><p><b>${esc(invitedBy)}</b> te dio acceso a AllAtYou Admin.</p>
      <p>Puedes entrar con <b>Google</b> usando <b>${esc(user.email)}</b> en <a href="${esc(webUrl())}/login">${esc(webUrl())}/login</a>, o crear tu contraseña:</p>
      ${buttonHtml(link, "Crear mi contraseña")}<p style="color:#64748b">El enlace vence en ${INVITE_HOURS} horas.</p>`,
  });
}
