// src/middleware/basicAuth.ts
// Guard de las rutas admin. Acepta (Issue #49, spec docs/specs/usuarios-auth.md):
//  1. "Bearer <token>"  → sesión de un usuario personal (admin_users).
//  2. "Basic ..."       → usuario/clave genérico, solo hasta LEGACY_BASIC_AUTH_UNTIL.
//  3. "X-Service-Token" → integración AllAtYou Taller (TALLER_SERVICE_TOKEN), solo en SERVICE_ROUTES.
// Se mantiene el nombre `basicAuth` para no tocar los montajes existentes.
import { Request, Response, NextFunction } from "express";
import {
  AdminUser,
  checkLegacyBasic,
  checkServiceToken,
  isLegacyActive,
  isServiceRouteAllowed,
  legacyUntil,
  resolveSession,
} from "../lib/adminAuth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: AdminUser | null;
      authMode?: "session" | "legacy" | "service";
      sessionToken?: string;
    }
  }
}

export async function basicAuth(req: Request, res: Response, next: NextFunction) {
  const serviceToken = req.headers["x-service-token"];
  if (typeof serviceToken === "string" && serviceToken) {
    if (!checkServiceToken(serviceToken)) {
      return res.status(401).json({ error: "invalid_service_token", message: "Token de servicio inválido." });
    }
    if (!isServiceRouteAllowed(req.method, req.originalUrl)) {
      return res.status(403).json({ error: "forbidden", message: "Ruta no permitida para el token de servicio." });
    }
    req.adminUser = null;
    req.authMode = "service";
    return next();
  }

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
