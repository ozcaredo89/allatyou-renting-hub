# Spec — Usuarios del panel admin y autenticación

**Estado:** Vigente · **Última revisión:** 2026-11-12 (Issue #49)
**Código principal:** `src/lib/adminAuth.ts`, `src/middleware/basicAuth.ts`, `src/routes/auth.ts`, `web/src/lib/auth.ts`, `web/src/pages/Login.tsx`, `web/src/pages/ResetPassword.tsx`, `web/src/components/AccountOnboarding.tsx`, `web/src/components/GoogleButton.tsx`, migración `2026111200_admin_users.sql`

---

## 1. Objetivo

Reemplazar el usuario/clave genérico compartido (`ADMIN_BASIC_USER`/`ADMIN_BASIC_PASS`, pedido con `prompt()`) por **usuarios personales**, con el menor rechazo posible: mismas pantallas, migración guiada de 1 minuto y convivencia temporal de ambos accesos.

## 2. Reglas

1. **Formas de entrar:** Google (recomendado) o correo + contraseña. Un mismo usuario puede tener ambas; el correo es único (sin distinguir mayúsculas).
2. **Quién puede crear usuarios:** solo alguien ya autenticado. No hay registro abierto en internet.
   - Con el acceso genérico vigente → el asistente crea **su propio** usuario (Google o correo+clave) y queda con sesión personal.
   - Con sesión personal → **"Invitar usuario"**: crea a otra persona; le llega un correo para crear su contraseña (enlace de 72 h) o puede entrar con Google si su correo es de Google.
   - Google con un correo sin usuario y sin estar autenticado → se rechaza con instrucciones.
3. **Aviso de usuarios nuevos:** cada creación envía un correo a `ADMIN_SIGNUP_NOTIFY_EMAIL` (default: oscar.hv89@gmail.com) con nombre, correo, método, quién lo creó y fecha. Un fallo de correo no bloquea la creación.
4. **Acceso al panel:** cualquier usuario activo tiene acceso completo (aún no hay roles; ver preguntas abiertas). Desactivar = `admin_users.status = 'disabled'` (cierra sus sesiones en ≤ 1 min por la caché).
5. **Sesiones:** token aleatorio guardado en `localStorage` del navegador, válido 30 días; en BD solo se guarda su sha256. Cerrar sesión la revoca.
6. **Recuperar contraseña:** "¿Olvidaste tu contraseña?" envía un enlace de un solo uso que vence en 60 min. La respuesta no revela si el correo existe. Al cambiarla se cierran todas las sesiones del usuario. Máx. 10 intentos / 15 min por correo en login y recuperación.
7. **Retiro del acceso genérico (Decisión 2026-11-12):** funciona hasta el **2026-11-22** inclusive (hora Colombia), configurable con `LEGACY_BASIC_AUTH_UNTIL`. Mientras esté activo, el panel muestra un banner con la fecha y los días restantes, y el asistente se abre solo al entrar con él. Desde el día siguiente el API lo rechaza (`legacy_disabled`) automáticamente, sin deploy.

## 3. Compatibilidad (por qué no rompe nada)

- Las páginas siguen llamando `ensureBasicAuth()`: ahora devuelve `Bearer <token>` si hay sesión personal o el `Basic` genérico si no. Sin credenciales redirige a `/login`.
- El middleware se sigue llamando `basicAuth` y acepta ambos esquemas; los montajes de `src/index.ts` no cambian.
- `/driver-applications` (admin) solo verificaba que el header *empezara* por `Basic` (cualquier clave pasaba); ahora usa el middleware real.

## 4. Configuración

- **API (Railway):** `GOOGLE_CLIENT_ID` (sin ella se oculta el botón de Google), `LEGACY_BASIC_AUTH_UNTIL`, `ADMIN_SIGNUP_NOTIFY_EMAIL`, `ADMIN_WEB_URL` (base de los enlaces de correo). Todas opcionales.
- **Google Cloud Console:** OAuth Client ID tipo *Web*, con orígenes autorizados `https://web.allatyou.com` y `http://localhost:5174`. El frontend obtiene el Client ID de `GET /auth/config` (no hay variable `VITE_`).

## 5. Preguntas abiertas

- Roles/permisos por módulo y registro `created_by` en cada tabla (Issue #29).
- Pantalla para listar/desactivar usuarios (hoy: `GET /auth/users` y la tabla `admin_users`).
