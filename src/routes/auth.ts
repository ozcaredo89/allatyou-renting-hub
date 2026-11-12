// src/routes/auth.ts
// Usuarios personales del panel admin (Issue #49). Spec: docs/specs/usuarios-auth.md
// Rutas públicas: /config, /login, /google, /forgot, /reset.
// Rutas que exigen estar autenticado (genérico o sesión): /me, /register, /users, /logout.
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { basicAuth } from "../middleware/basicAuth";
import {
  INVITE_HOURS,
  checkLegacyBasic,
  consumeResetToken,
  createResetToken,
  createSession,
  createUser,
  findUserByEmail,
  findUserByGoogleSub,
  googleClientId,
  hashPassword,
  isLegacyActive,
  isValidEmail,
  legacyUntil,
  listUsers,
  normalizeEmail,
  notifyNewUser,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  sendInviteEmail,
  sendResetEmail,
  toPublicUser,
  updateUser,
  validatePassword,
  verifyGoogleCredential,
  verifyPassword,
} from "../lib/adminAuth";

const r = Router();

// Límite por correo (no por IP: el API está detrás del proxy de Railway).
const byEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `${req.path}:${normalizeEmail(req.body?.email) || "anon"}`,
  message: { error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." },
  skip: (req) => req.method === "OPTIONS",
  validate: false,
});

/** Quién está creando el usuario, si el request viene autenticado (genérico o sesión). */
async function currentActor(req: Request): Promise<{ mode: "legacy" | "session" | null; userId: string | null; label: string }> {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const s = await resolveSession(header.slice(7).trim());
    if (s) return { mode: "session", userId: s.user.id, label: `${s.user.full_name} <${s.user.email}>` };
  } else if (checkLegacyBasic(header) && isLegacyActive()) {
    return { mode: "legacy", userId: null, label: "Acceso genérico (asistente de migración)" };
  }
  return { mode: null, userId: null, label: "" };
}

// GET /auth/config — lo que necesita la pantalla de login
r.get("/config", (_req, res) => {
  res.json({ googleClientId: googleClientId(), legacyUntil: legacyUntil(), legacyActive: isLegacyActive() });
});

// POST /auth/login — correo + contraseña
r.post("/login", byEmailLimiter, async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const user = email ? await findUserByEmail(email) : null;
    if (!user || user.status !== "active" || !verifyPassword(password, user.password_hash)) {
      const hint = user && !user.password_hash && user.google_sub
        ? "Esta cuenta entra con Google. Usa el botón de Google o recupera la contraseña para crear una."
        : "Correo o contraseña incorrectos.";
      return res.status(401).json({ error: hint });
    }
    const token = await createSession(user.id, req.headers["user-agent"]);
    return res.json({ token, user: toPublicUser(user) });
  } catch (e: any) {
    console.error("[auth/login]", e);
    return res.status(500).json({ error: "No se pudo iniciar sesión." });
  }
});

// POST /auth/google — { credential } del botón de Google.
// Usuario existente → inicia sesión (y vincula Google si entró por correo antes).
// Usuario nuevo → solo se crea si el request viene autenticado (asistente o invitación).
r.post("/google", async (req: Request, res: Response) => {
  try {
    const profile = await verifyGoogleCredential(String(req.body?.credential || ""));
    let user = (await findUserByGoogleSub(profile.sub)) || (await findUserByEmail(profile.email));

    if (user) {
      if (user.status !== "active") return res.status(403).json({ error: "Tu usuario está desactivado." });
      if (!user.google_sub) {
        user = await updateUser(user.id, { google_sub: profile.sub, avatar_url: user.avatar_url || profile.picture });
      }
    } else {
      const actor = await currentActor(req);
      if (!actor.mode) {
        return res.status(403).json({
          error: isLegacyActive()
            ? `Aún no tienes usuario. Entra con el acceso genérico y crea tu usuario desde el asistente (disponible hasta el ${legacyUntil()}).`
            : "Aún no tienes usuario. Pide a un administrador que te invite.",
        });
      }
      user = await createUser({
        email: profile.email,
        full_name: profile.name,
        google_sub: profile.sub,
        avatar_url: profile.picture,
        created_via: actor.mode === "legacy" ? "legacy_wizard" : "invite",
        created_by: actor.userId,
      });
      void notifyNewUser(toPublicUser(user), "Google", actor.label);
    }

    const token = await createSession(user.id, req.headers["user-agent"]);
    return res.json({ token, user: toPublicUser(user) });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "No se pudo entrar con Google." });
  }
});

// POST /auth/forgot — { email }. Siempre responde ok (no revela si el correo existe).
r.post("/forgot", byEmailLimiter, async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  try {
    const user = email ? await findUserByEmail(email) : null;
    if (user && user.status === "active") {
      const token = await createResetToken(user.id);
      await sendResetEmail(toPublicUser(user), token);
    }
  } catch (e) {
    console.error("[auth/forgot]", e);
  }
  return res.json({ ok: true });
});

// POST /auth/reset — { token, password }. Sirve para recuperar y para invitaciones.
r.post("/reset", async (req: Request, res: Response) => {
  const pwError = validatePassword(req.body?.password);
  if (pwError) return res.status(400).json({ error: pwError });
  try {
    const userId = await consumeResetToken(String(req.body?.token || ""));
    if (!userId) return res.status(400).json({ error: "El enlace venció o ya se usó. Pide uno nuevo." });
    await revokeAllSessions(userId);
    const user = await updateUser(userId, { password_hash: hashPassword(req.body.password) });
    if (user.status !== "active") return res.status(403).json({ error: "Tu usuario está desactivado." });
    const token = await createSession(user.id, req.headers["user-agent"]);
    return res.json({ token, user: toPublicUser(user) });
  } catch (e: any) {
    console.error("[auth/reset]", e);
    return res.status(500).json({ error: "No se pudo cambiar la contraseña." });
  }
});

// ---------------- Autenticadas ----------------

// GET /auth/me — quién soy y con qué modo entré
r.get("/me", basicAuth, (req: Request, res: Response) => {
  res.json({ mode: req.authMode, user: req.adminUser ?? null, legacyUntil: legacyUntil(), legacyActive: isLegacyActive() });
});

// POST /auth/register — { full_name, email, password? }
// - Desde el acceso genérico (asistente): crea MI usuario con contraseña y devuelve sesión.
// - Desde una sesión personal: invita a otra persona; le llega un correo para crear su clave.
r.post("/register", basicAuth, async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const full_name = String(req.body?.full_name || "").trim();
  if (!full_name) return res.status(400).json({ error: "Escribe el nombre completo." });
  if (!isValidEmail(email)) return res.status(400).json({ error: "Escribe un correo válido." });

  const isLegacy = req.authMode === "legacy";
  let password_hash: string | null = null;
  if (isLegacy) {
    const pwError = validatePassword(req.body?.password);
    if (pwError) return res.status(400).json({ error: pwError });
    password_hash = hashPassword(req.body.password);
  }

  try {
    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: "Ya existe un usuario con ese correo. Entra con él o recupera la contraseña." });
    }
    const user = await createUser({
      email,
      full_name,
      password_hash,
      created_via: isLegacy ? "legacy_wizard" : "invite",
      created_by: req.adminUser?.id ?? null,
    });
    const pub = toPublicUser(user);
    const actorLabel = isLegacy ? "Acceso genérico (asistente de migración)" : `${req.adminUser!.full_name} <${req.adminUser!.email}>`;
    void notifyNewUser(pub, isLegacy ? "Correo y contraseña" : "Invitación", actorLabel);

    if (isLegacy) {
      const token = await createSession(user.id, req.headers["user-agent"]);
      return res.status(201).json({ token, user: pub });
    }
    const resetToken = await createResetToken(user.id, INVITE_HOURS * 60);
    let invited = true;
    try {
      await sendInviteEmail(pub, resetToken, req.adminUser!.full_name);
    } catch (e) {
      console.error("[auth/register] invitación no enviada:", e);
      invited = false;
    }
    return res.status(201).json({ user: pub, invited });
  } catch (e: any) {
    console.error("[auth/register]", e);
    return res.status(500).json({ error: "No se pudo crear el usuario." });
  }
});

// GET /auth/users — listado de usuarios
r.get("/users", basicAuth, async (_req: Request, res: Response) => {
  try {
    return res.json(await listUsers());
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

// POST /auth/logout — cierra la sesión actual
r.post("/logout", basicAuth, async (req: Request, res: Response) => {
  if (req.sessionToken) await revokeSession(req.sessionToken);
  return res.json({ ok: true });
});

export default r;
