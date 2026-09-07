# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AllAtYou Renting Hub is an internal ERP for a car-rental/leasing fleet operator (Colombia). Monorepo with two independently deployed halves:

- **API** (repo root, `src/`): Express 5 + TypeScript, talks to Supabase (Postgres + Storage). Deployed to Railway.
- **Web** (`web/`): Vite + React 19 + TypeScript + Tailwind v4. Deployed to Vercel.

Domain: driver payments/mora tracking, expense proration across vehicles, operational advances (loans) to drivers, monthly profit/ledger accounting, leasing/rent-to-own contracts, fleet GPS telemetry ("Oráculo"), vehicle inspections, expense audits, inventory/workshop, marketplace listings, and a WhatsApp/email reminders pipeline.

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

Database schema changes are plain SQL files in `supabase/migrations/`, named `YYYYMMDD[_NN]_description.sql` and applied to Supabase directly (no local Supabase CLI wiring in this repo — check with the user before assuming migrations have been applied).

## Architecture

### API structure (`src/`)
- `index.ts` — single composition root: builds the CORS allowlist, mounts every route module, and on boot starts three background loops (see Background daemons below). New route modules must be imported and mounted here.
- `routes/*.ts` — one file per resource, each exporting an Express `Router`. Look here first for any endpoint.
- `lib/*.ts` — shared backend logic: `supabase.ts` (service-role client, bypasses RLS), `amort.ts` (amortization math), `leasingCascade.ts`, `contractGenerator.ts` (docx/PDF contract generation via `puppeteer` + `html-to-docx`, template in `src/templates/contrato.html`), `receiptClassification.ts` + `ocr.ts` (AI receipt/comprobante validation via OpenAI/Gemini), `ai-registry.ts` + `ai-rate-limiter.ts`, `whatsapp.ts` / `email.ts` (Twilio/SMTP notifications), `r2.ts` (S3-compatible object storage via AWS SDK).
- `oraculo/` — a **separate, self-contained daemon subsystem** for fleet GPS telemetry (Protrack integration): `engine.ts` runs the geospatial ingestion cycle, `monitor.ts` detects market opportunities, `sync-imei.ts` pairs GPS IMEIs to vehicles, `mileage-daemon.ts` extracts mileage, `api.ts` serves a small monetization/DaaS HTTP API of its own. Started via `startOracleDaemon()` in `oraculo/index.ts`.
- `middleware/basicAuth.ts` — the only auth mechanism for internal/admin routes (see Auth below).

### Auth model
There is no session/JWT auth. Admin-facing routes are gated by **HTTP Basic Auth** (`middleware/basicAuth.ts`, credentials from `ADMIN_BASIC_USER`/`ADMIN_BASIC_PASS`), applied per-route at mount time in `index.ts` (e.g. `app.use("/vehicles", basicAuth, vehiclesRoutes)`). Driver/public-facing routes (`/drivers`, `/payments`, `/expenses`, `/marketing`, `/chat`, `/marketplace`, `/pledges`, `/trips`, `/driver-applications`, `/vehicle-applications`) are unauthenticated by design. When adding a new route, decide up front whether it needs `basicAuth` and mount it accordingly — don't add auth logic inside the route handler itself.

Separately, the **`companies`** resource (accounts-receivable / cuentas de cobro) has its own lightweight OTP flow (`routes/companies.ts`: `/companies/auth/request` + `/auth/verify`, code sent via WhatsApp+email, verified client-side by `web/src/components/CompanyLock.tsx` storing an unlock in memory) — unrelated to the admin Basic Auth.

The frontend has a matching `web/src/lib/auth.ts`: prompts for admin credentials once, caches the Basic Auth header in `sessionStorage`, and `requestWithBasicAuth()` wraps `fetch` to attach it automatically. Use that helper (not raw `fetch`) for any new admin API call.

### Background daemons (started from `src/index.ts` on server boot)
1. **Oráculo telemetry daemon** (`startOracleDaemon()`) — GPS ingestion every 3 min, market-opportunity detection daily, a nightly (03:00) PostGIS DBSCAN hotspot-clustering RPC call, all on `setInterval`.
2. **GPS IMEI sync** (`syncGpsImeis`) — pairs new GPS device IMEIs to vehicles, every 12h.
3. **Protrack mileage sync** (`syncProtrackMileage`) — pulls odometer readings, every 12h, staggered 30s after IMEI sync.

These run in-process (not separate workers) — restarting the API restarts all three. Keep this in mind when reasoning about timing/state: there's no external job queue.

### Reminders pipeline
`routes/reminders.ts` exposes an internal endpoint invoked by `.github/workflows/reminders.yml`, a scheduled GitHub Action that curl-POSTs it three times daily (10:00/15:00/23:00 UTC) with an `X-Internal-Secret` header — this is the payment-reminder trigger, not the Oráculo daemon.

### Web structure (`web/src/`)
- `App.tsx` — single router with a **hostname-based split**: if `hostname` is `web.allatyou.com` or `localhost`, it renders the internal ERP (all `/admin`-style routes, wrapped in `AdminLayout`); any other hostname renders the public marketing `Landing` site (`PublicLayout`). Keep this split in mind when adding a route — decide whether it belongs under the "APP INTERNA" or "LANDING" branch.
- `pages/Admin*.tsx` — one large page component per admin module (these files run large, several 500KB+ ... actually up to ~90KB; expect substantial single-file components, not deeply decomposed ones).
- `components/` — shared UI (layouts, modals, forms) reused across admin pages.
- `lib/auth.ts` — Basic Auth helper described above.
- Note: `pages/AdminAmortization.tsx.backup` and `pages/AdminAmortization_old.tsx` are stale snapshots left in the tree, not active code — don't edit them, and don't assume they reflect current behavior.

### Database (Supabase/Postgres)
Schema lives in `supabase/migrations/*.sql` (chronological, hand-written) plus baseline dumps in `docs/*.sql` (`Database.sql`, `Database_Updates.sql`). Key tables/domains: `payments` (driver payments incl. AI-assisted receipt classification), `expenses`/`expense_vehicles`/`expense_audit_log` (prorated multi-vehicle expenses with audit trail), `vehicle_ledger` (manual accounting adjustments feeding monthly profit), `vehicle_investments` (capital-recovery tracking), `operational_advances`/`operational_advance_schedule` (driver loans with auto-generated payment schedules), leasing/rent-to-own tables (`20260714_leasing_schema.sql` and related migrations), `oracle_nodes`/BI views (GPS telemetry), `driver_liquidations`. The service-role Supabase client in `src/lib/supabase.ts` bypasses RLS — all authorization is therefore enforced at the API layer (`basicAuth`), not in the database.

## Conventions specific to this repo
- Code comments, commit-adjacent inline notes, and route docstrings are written in **Spanish**; match that when editing existing files.
- Route files are organized by resource/domain, one Express `Router` per file, default-exported and mounted by name in `src/index.ts` — follow this pattern for new endpoints rather than adding routes inline.
- The backend `tsconfig.json` excludes `web/` entirely (root TS project only compiles `src/`); the two halves have fully separate TypeScript configs and are never built together.
