# Spec — Variables de entorno y bloqueo de deploys

**Estado:** Vigente · **Última revisión:** 2026-11-07
**Código principal:** `src/lib/env.ts`, `src/validateEnv.ts`, `web/src/vite-env-required.ts`, `web/vite.config.ts`, `scripts/check-env.js`, `.github/workflows/ci.yml`, `railway.json`

---

## 1. Regla (Decisión 2026-11-07 — Issue #18)

No debe llegar a producción código que use una variable de entorno que no esté configurada. Si falta una variable requerida, el deploy **falla y producción sigue con la versión anterior**.

## 2. Registro único

- **API:** `src/lib/env.ts` (`ENV_VARS`). **Web:** `web/src/vite-env-required.ts` (`WEB_ENV_VARS`).
- Cada variable se marca `required` (sin ella la funcionalidad falla) u `optional` (tiene default o se apaga de forma controlada).
- **Toda variable nueva** se declara ahí en el mismo PR y se configura en Railway/Vercel **antes** de mergear.

## 3. Cuatro barreras

| Barrera | Cuándo | Qué hace |
|---|---|---|
| CI (`ci.yml` + `check-env.js`) | En cada PR a `main` | Falla si el código usa una variable no declarada en el registro. También compila API y typecheck de web. |
| Arranque del API (`validateEnv.ts`) | Al iniciar en Railway (`RAILWAY_ENVIRONMENT_NAME` o `NODE_ENV=production`) | Si falta una `required`, lista las faltantes en el log y termina el proceso. En local solo advierte. |
| Healthcheck (`railway.json` → `/health`) | En cada deploy de Railway | Si el API no arranca, Railway no activa el deploy nuevo y mantiene el anterior. |
| Build web (`vite.config.ts`) | `vite build` de producción en Vercel | Si falta una `required`, el build falla y Vercel no publica. |

## 4. Notas

- `NODE_ENV` y `RAILWAY_ENVIRONMENT_NAME` las inyecta la plataforma: no se declaran.
- Variables usadas solo en scripts locales (`test-*.ts`, `bank-sync/`) no entran al registro.
- Los deploys **Preview** de Vercel también validan: `VITE_API_URL` debe existir en ese entorno.

## 5. Migraciones y deploy (Decisión 2026-11-12 — Issue #55)

Incidente: `2026111200_admin_users.sql` compartía versión con `2026111200_fleet_digest_runs.sql`; el job de migraciones falló en `main` pero el API nuevo quedó desplegado sin su tabla. Regla: **si una migración falla, el deploy del API también falla.**

| Barrera | Cuándo | Qué hace |
|---|---|---|
| `scripts/check-migrations.js` (en `ci.yml` y `migrations.yml`) | Cada PR y push a `main` | Falla si dos archivos comparten versión o el nombre no es `YYYYMMDDNN_descripcion.sql`. |
| Dry run (`migrations.yml`) | PR que toca `supabase/migrations/` | Muestra qué se aplicaría. |
| Arranque del API (`src/lib/migrationGuard.ts`) | Cada arranque en Railway | Compara `supabase/migrations/` con `public.applied_migration_versions()`. Si falta alguna, reintenta 90 s (el job puede seguir corriendo) y luego termina el proceso → healthcheck falla → Railway mantiene el deploy anterior. En local solo advierte. |
| "Wait for CI" en Railway | Push a `main` | Railway no despliega si algún workflow del commit falla. |

El frontend (Vercel) no espera las migraciones; como depende del API, una falla deja al API anterior respondiendo.
