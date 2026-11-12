# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AllAtYou Renting Hub is an internal ERP for a car-rental/leasing fleet operator (Colombia). Monorepo with two independently deployed halves:

- **API** (repo root, `src/`): Express 5 + TypeScript, talks to Supabase (Postgres + Storage). Deployed to Railway.
- **Web** (`web/`): Vite + React 19 + TypeScript + Tailwind v4. Deployed to Vercel.

Domain: driver payments/mora tracking, expense proration across vehicles, operational advances (loans) to drivers, monthly profit/ledger accounting, leasing/rent-to-own contracts, fleet GPS telemetry ("Oráculo"), vehicle inspections, expense audits, inventory/workshop, marketplace listings, and a WhatsApp/email reminders pipeline.

## Workflow & Git Flow (Obligatorio)

Seguir estrictamente la política documentada en `docs/specs/flujo-git-tickets.md`:
1. **1 Requerimiento = 1 Ticket en GitHub (#ID) = 1 Rama dedicada = 1 PR**. Nunca trabajar directamente en `main`.
2. Crear la rama antes de tocar cualquier archivo: `git checkout -b feat/<id>-<slug>` o `fix/<id>-<slug>`.
3. Commits con referencia al ticket: `feat(#<id>): <descripción>` o `fix(#<id>): <descripción>`.
4. Abrir Pull Request usando la plantilla `.github/pull_request_template.md` (`Closes #<id>`) y verificar que compile backend y frontend (`npm.cmd run build` en root y `cd web && npm.cmd run build`).
5. Hacer merge del Pull Request a `main` (`gh pr merge --merge --delete-branch`) y volver a `main` actualizado (`git checkout main && git pull`) para que el cambio se despliegue y el ticket quede cerrado automáticamente. No dejar PRs abiertos salvo que el usuario lo pida explícitamente.

## Commands

**Backend (repo root):**
```bash
npm run dev      # nodemon --exec ts-node src/index.ts — hot-reloading API on $PORT (default 3000)
npm run build    # tsc -> dist/
npm start        # node dist/index.js (production)
```

**Frontend (`web/`):**
```bash
cd web
npm run dev       # vite dev server on http://localhost:5174
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # preview the production build
```

There is no automated test suite (no `test` script in either `package.json`, no test runner configured). One-off verification scripts live at the repo root as `test-*.ts` (e.g. `test-schedule.ts`, `test-driver-schema.ts`) and are run directly with `ts-node <file>.ts` — treat them as manual debugging scripts, not a suite to maintain or run in CI.

Database schema changes are plain SQL files in `supabase/migrations/`, named `YYYYMMDDNN_description.sql` (10-digit unique version: date + 2-digit sequence for that day, starting at `00`). The Supabase CLI uses the digits before the first `_` as the version, so two files must never share it. `.github/workflows/migrations.yml` applies them automatically with `supabase db push` on every push to `main` that touches `supabase/migrations/` (and runs a `--dry-run` on PRs); Railway has "Wait for CI" enabled so the backend deploys only after the migration job passes. Never apply a migration by hand in the SQL Editor: it would be re-run by the pipeline. Write migrations so they are safe to run once against production (prefer `if not exists` / `create or replace`).

## Architecture

### API structure (`src/`)
- `index.ts` — single composition root: builds the CORS allowlist, mounts every route module, and on boot starts three background loops (see Background daemons below). New route modules must be imported and mounted here.
- `routes/*.ts` — one file per resource, each exporting an Express `Router`. Look here first for any endpoint.
- `lib/*.ts` — shared backend logic: `supabase.ts` (service-role client, bypasses RLS), `amort.ts` (amortization math), `leasingCascade.ts`, `contractGenerator.ts` (docx/PDF contract generation via `puppeteer` + `html-to-docx`, template in `src/templates/contrato.html`), `receiptClassification.ts` + `ocr.ts` (AI receipt/comprobante validation via OpenAI/Gemini), `ai-registry.ts` + `ai-rate-limiter.ts`, `whatsapp.ts` / `email.ts` (Twilio/SMTP notifications), `r2.ts` (S3-compatible object storage via AWS SDK).
- `oraculo/` — a **separate, self-contained daemon subsystem** for fleet GPS telemetry (Protrack integration): `engine.ts` runs the geospatial ingestion cycle, `monitor.ts` detects market opportunities, `sync-imei.ts` pairs GPS IMEIs to vehicles, `mileage-daemon.ts` extracts mileage, `api.ts` serves a small monetization/DaaS HTTP API of its own. Started via `startOracleDaemon()` in `oraculo/index.ts`.
- `middleware/basicAuth.ts` — the only auth mechanism for internal/admin routes (see Auth below).

### Auth model
Admin-facing routes are gated by the `basicAuth` middleware (`middleware/basicAuth.ts`), applied per-route at mount time in `index.ts` (e.g. `app.use("/vehicles", basicAuth, vehiclesRoutes)`). Despite its name it accepts **personal user sessions** (`Authorization: Bearer <token>`, users in `admin_users`, login with Google or email+password, see `routes/auth.ts` and `docs/specs/usuarios-auth.md`) and, until `LEGACY_BASIC_AUTH_UNTIL` (2026-11-22), the legacy shared Basic credentials. It sets `req.adminUser` (null for legacy). Driver/public-facing routes (`/drivers`, `/payments`, `/marketing`, `/chat`, `/marketplace`, `/pledges`, `/trips`, `/driver-applications`, `/vehicle-applications`) are unauthenticated by design. When adding a new route, decide up front whether it needs `basicAuth` and mount it accordingly — don't add auth logic inside the route handler itself.

Separately, the **`companies`** resource (accounts-receivable / cuentas de cobro) has its own lightweight OTP flow (`routes/companies.ts`: `/companies/auth/request` + `/auth/verify`, code sent via WhatsApp+email, verified client-side by `web/src/components/CompanyLock.tsx` storing an unlock in memory) — unrelated to the admin Basic Auth.

The frontend has a matching `web/src/lib/auth.ts`: `ensureBasicAuth()` returns the current Authorization header (Bearer session from `localStorage`, or legacy Basic) and redirects to `/login` when there is none; `requestWithBasicAuth()` wraps `fetch` to attach it automatically. Use that helper (not raw `fetch`) for any new admin API call.

### Background daemons (started from `src/index.ts` on server boot)
1. **Oráculo telemetry daemon** (`startOracleDaemon()`) — GPS ingestion every 3 min, market-opportunity detection daily, a nightly (03:00) PostGIS DBSCAN hotspot-clustering RPC call, all on `setInterval`.
2. **GPS IMEI sync** (`syncGpsImeis`) — pairs new GPS device IMEIs to vehicles, every 12h.
3. **Protrack mileage sync** (`syncProtrackMileage`) — pulls odometer readings, every 12h, staggered 30s after IMEI sync.

These run in-process (not separate workers) — restarting the API restarts all three. Keep this in mind when reasoning about timing/state: there's no external job queue.

### Reminders pipeline
`routes/reminders.ts` exposes an internal endpoint invoked by `.github/workflows/reminders.yml`, a scheduled GitHub Action that curl-POSTs it three times daily (10:00/15:00/23:00 UTC) with an `X-Internal-Secret` header — this is the reminder trigger (public SOAT/Tecno/Pico y Placa subscriptions plus the daily fleet expiry digest to `FLEET_REMINDER_EMAILS`), not the Oráculo daemon.

### Web structure (`web/src/`)
- `App.tsx` — single router with a **hostname-based split**: if `hostname` is `web.allatyou.com` or `localhost`, it renders the internal ERP (all `/admin`-style routes, wrapped in `AdminLayout`); any other hostname renders the public marketing `Landing` site (`PublicLayout`). Keep this split in mind when adding a route — decide whether it belongs under the "APP INTERNA" or "LANDING" branch.
- `pages/Admin*.tsx` — one large page component per admin module (these files run large, several 500KB+ ... actually up to ~90KB; expect substantial single-file components, not deeply decomposed ones).
- `components/` — shared UI (layouts, modals, forms) reused across admin pages.
- `lib/auth.ts` — Basic Auth helper described above.
- Note: `pages/AdminAmortization.tsx.backup` and `pages/AdminAmortization_old.tsx` are stale snapshots left in the tree, not active code — don't edit them, and don't assume they reflect current behavior.

### Mapa rápido URL → Archivos (Frontend + Backend)

Cuando el usuario mencione una URL o pantalla, **ir directamente al archivo listado** sin hacer barridos de directorios (`Get-ChildItem`) ni leer archivos enteros:

| Ruta URL (`web` / `www`) | Página Frontend (`web/src/pages/`) | Componentes Clave (`web/src/components/`) | Ruta Backend (`src/routes/`) | Spec (`docs/specs/`) |
|---|---|---|---|---|
| `/pay` | `Pay.tsx` | — | `payments.ts`, `uploads.ts`, `noPay.ts` | `pagos.md` |
| `/reports` | `Reports.tsx` | `PaymentApprovalModal.tsx`, `ResolveDaysModal.tsx`, `BankReconciliationModal.tsx` | `reports.ts`, `payments.ts` | `pagos.md` |
| `/expenses` | `Expenses.tsx` | `ExpenseRenewalModal.tsx`, `ExpenseHeatmap.tsx` | `expenses.ts` | `gastos-fondo-mantenimiento.md` |
| `/advances` | `AdminAdvances.tsx` | `AdvancePaymentModal.tsx` | `advances.ts` | `anticipos.md` |
| `/profit` | `AdminProfit.tsx` | — | `profit.ts`, `ledger.ts`, `investments.ts` | `utilidades.md` |
| `/amortization` | `AdminAmortization.tsx` | — | `leasing.ts` | `leasing.md` |
| `/deposits` | `AdminDeposits.tsx` | `LiquidationModal.tsx`, `LiquidationDocModal.tsx` | `deposits.ts`, `liquidations.ts` | — |
| `/collections` | `AdminCollections.tsx` | `CompanyLock.tsx`, `BillGeneratorModal.tsx` | `collections.ts`, `companies.ts` | `cobranza-collections.md` |
| `/vehicles` | `AdminVehicles.tsx` | `VehicleDateField.tsx`, `GlobalMileageReport.tsx`, `GlobalOilReport.tsx` | `vehicles.ts` | `flota-referencia.md` |
| `/drivers` | `AdminDrivers.tsx` | `DriverModal.tsx` | `drivers.ts` | `conductores.md` |
| `/recruitment` | `AdminRecruitment.tsx` | `DriverApplicationForm.tsx` | `driverApplications.ts` | — |
| `/inspections`, `/inspections/new` | `AdminInspections.tsx`, `NewInspection.tsx`, `PublicInspectionView.tsx` | — | `inspections.ts` | `inspecciones.md`, `inspecciones-dashboard.md` |
| `/inventory` | `AdminInventory.tsx` | — | `inventory.ts` | — |
| `/marketplace` (→ `/recruitment?tab=vehicles`), `/rent`, `/rent-your-car` | `AdminRecruitment.tsx`, `RentCatalog.tsx`, `RentYourCar.tsx` | `VehicleApplicationForm.tsx`, `VehicleModelCombobox.tsx` | `marketplace.ts`, `vehicleApplications.ts` | `marketplace.md`, `vehiculos-onboarding.md` |
| `/reminders-log` | `RemindersLog.tsx` | `ReminderSubscriptionCard.tsx` | `reminders.ts` | `recordatorios.md` |
| `/oracle` | `AdminOracle.tsx` | `FleetMap.tsx`, `TopDwellLocations.tsx` | `oracle.ts`, `fleetMap.ts` (`src/oraculo/*`) | — |
| `/trips`, `/bid/:id` | `AdminTrips.tsx`, `BidTrip.tsx` | `TripBookingForm.tsx` | `trips.ts` | — |
| `/audits` | `AdminAudits.tsx` | — | `audits.ts` | — |
| `/` (Landing pública) | `Landing.tsx` (`landing_views/*`) | `IncomeSimulator.tsx`, `InvestmentVaki.tsx`, `MarketingSections.tsx` | `marketing.ts`, `pledges.ts` | `landing.md` |

### Reglas de velocidad y precisión para Agentes IA
1. **Cero exploración innecesaria**: Si el usuario da la ruta (ej. `/pay`) o el nombre del módulo, usa la tabla de arriba para ir directo al archivo y al spec correspondiente. No listes `src/` ni `web/src/`.
2. **Búsqueda quirúrgica en archivos grandes**: Archivos como `Pay.tsx` (~2.000 líneas), `payments.ts` (~2.500 líneas) o `reports.ts` (~1.900 líneas) NO deben leerse de principio a fin en bloques de 800 líneas. Usa `Select-String -Path <archivo> -Pattern "<campo/endpoint>"` para obtener el número de línea exacto y luego `read_file` solo en el rango de ±40 líneas alrededor del objetivo.
3. **Windows / PowerShell**: Ejecutar siempre `npm.cmd` (ej. `npm.cmd run build`) en lugar de `npm` para evitar bloqueos de `ExecutionPolicy` sobre `npm.ps1`.

### Database (Supabase/Postgres)
Schema lives in `supabase/migrations/*.sql` (chronological, hand-written) plus baseline dumps in `docs/*.sql` (`Database.sql`, `Database_Updates.sql`). Key tables/domains: `payments` (driver payments incl. AI-assisted receipt classification), `expenses`/`expense_vehicles`/`expense_audit_log` (prorated multi-vehicle expenses with audit trail), `vehicle_ledger` (manual accounting adjustments feeding monthly profit), `vehicle_investments` (capital-recovery tracking), `operational_advances`/`operational_advance_schedule` (driver loans with auto-generated payment schedules), leasing/rent-to-own tables (`2026071400_leasing_schema.sql` and related migrations), `oracle_nodes`/BI views (GPS telemetry), `driver_liquidations`. The service-role Supabase client in `src/lib/supabase.ts` bypasses RLS — all authorization is therefore enforced at the API layer (`basicAuth`), not in the database.

## Business rules → `docs/specs/`
Business rules live in `docs/specs/` (index: `docs/specs/README.md`). **Before changing code in one of these domains, read its spec**, and update the spec in the same commit when a rule changes:
- Leasing / rent-to-own, cascade, `leasing_contracts_summary_vw` → `docs/specs/leasing.md`
- Driver payments, receipts/anti-fraud, payment approval → `docs/specs/pagos.md`
- Operational advances (driver loans) → `docs/specs/anticipos.md`
- Expenses, maintenance fund, debit notes → `docs/specs/gastos-fondo-mantenimiento.md`
- Reminders (public subscriptions + daily fleet SOAT/Tecno digest) → `docs/specs/recordatorios.md`
- Profit/rentabilidad panel (`/profit`, `routes/profit.ts`, `vehicle_month_*` views) → `docs/specs/utilidades.md`
- Users, login (Google/password), password recovery, legacy Basic retirement → `docs/specs/usuarios-auth.md`
- Environment variables (registry, boot check, CI check, Railway healthcheck) → `docs/specs/variables-entorno.md`. Any new `process.env.X` / `import.meta.env.VITE_X` must be declared in `src/lib/env.ts` / `web/src/vite-env-required.ts` in the same PR, or CI fails.
- Flujo Git & Tickets (Issue obligatorio, ramas y commits con #ID) → `docs/specs/flujo-git-tickets.md`

Never resolve a business ambiguity by inventing a rule: if the spec doesn't cover it, ask the user and record the answer in the spec.

## Conventions specific to this repo
- **Trazabilidad 1 Requerimiento = 1 Ticket = 1 Rama**: Todo desarrollo debe iniciar creando un Issue en GitHub (`#ID`). La rama DEBE llamarse `<tipo>/<id>-<slug>` (ej. `feat/4-expense-soat-tecno-renewal`). Todo commit DEBE referenciar el ticket (ej. `feat(#4): ...`). Ver `docs/specs/flujo-git-tickets.md`.
- Code comments, commit-adjacent inline notes, and route docstrings are written in **Spanish**; match that when editing existing files.
- Route files are organized by resource/domain, one Express `Router` per file, default-exported and mounted by name in `src/index.ts` — follow this pattern for new endpoints rather than adding routes inline.
- The backend `tsconfig.json` excludes `web/` entirely (root TS project only compiles `src/`); the two halves have fully separate TypeScript configs and are never built together.
