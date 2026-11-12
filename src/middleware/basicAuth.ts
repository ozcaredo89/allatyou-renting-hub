// src/middleware/basicAuth.ts
// Guard de las rutas admin. Acepta (Issue #49, spec docs/specs/usuarios-auth.md):
//  1. "Bearer <token>"  → sesión de un usuario personal (admin_users).
//  2. "Basic ..."       → usuario/clave genérico, solo hasta LEGACY_BASIC_AUTH_UNTIL.
// Se mantiene el nombre `basicAuth` para no tocar los montajes existentes.
import { Request, Response, NextFunction } from "express";
import { AdminUser, checkLegacyBasic, isLegacyActive, legacyUntil, resolveSession } from "../lib/adminAuth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: AdminUser | null;
      authMode?: "session" | "legacy";
      sessionToken?: string;
    }
  }
}

export async function basicAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";

  if (header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    try {
      const s = token ? await resolveSession(token) : null;
      if (s) {
        req.adminUser = s.user;
        req.authMode = "session";
        req.sessionToken = token;
        return next();
      }
    } catch (e) {
      console.error("[auth] Error validando sesión:", e);
    }
    return res.status(401).json({ error: "session_expired", message: "Tu sesión venció. Vuelve a iniciar sesión." });
  }

  if (header.startsWith("Basic ")) {
    if (!checkLegacyBasic(header)) return res.status(401).json({ error: "unauthorized", message: "Credenciales inválidas." });
    if (!isLegacyActive()) {
      return res.status(401).json({
        error: "legacy_disabled",
        message: "El usuario genérico fue retirado. Entra con tu usuario personal o con Google.",
      });
    }
    req.adminUser = null;
    req.authMode = "legacy";
    res.setHeader("X-Legacy-Auth-Until", legacyUntil());
    return next();
  }

  return res.status(401).json({ error: "auth_required", message: "Debes iniciar sesión." });
}
