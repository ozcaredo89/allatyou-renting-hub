# AllAtYou Renting Hub

Monorepo con **API (Express + TypeScript + Supabase)** y **Web (Vite + React + Tailwind v4)** para registrar pagos de conductores, subir comprobantes, autocompletar por placa y ver reportes con estado de **mora**.

## 🚀 Tech
- **API**: Node.js, Express 5, TypeScript  
- **DB**: Supabase (PostgreSQL + Storage)  
- **Web**: Vite + React + Tailwind v4

---

## 📦 Estructura

```
allatyou-renting-hub/
├─ src/                     # API (Express)
│  ├─ index.ts
│  ├─ lib/supabase.ts
│  ├─ routes/
│  │  ├─ payments.ts        # crear/listar pagos (valida placa, requiere comprobante)
│  │  ├─ uploads.ts         # subir imagen a Supabase Storage (comprobantes/)
│  │  ├─ drivers.ts         # GET /drivers/:plate (autocomplete)
│  │  └─ reports.ts         # GET /reports/last-payments (último pago + mora)
├─ web/                     # Frontend (Vite)
│  ├─ src/
│  │  ├─ App.tsx            # Router (Pagos/Reportes)
│  │  └─ pages/
│  │     ├─ Pay.tsx         # Formulario de pagos
│  │     └─ Reports.tsx     # Reporte (último pago + mora)
│  ├─ src/index.css
│  └─ .env                  # VITE_API_URL
├─ .env                     # SUPABASE_URL / SUPABASE_SERVICE_ROLE / PORT / WEB_ORIGIN
└─ README.md
```

---

## 🔐 Variables de entorno

**Backend (raíz: `.env`)**
```
SUPABASE_URL=https://<tu-ref>.supabase.co
SUPABASE_SERVICE_ROLE=<service-role-key>  # ¡No exponer en el front!
PORT=3000
WEB_ORIGIN=https://<tu-web>               # p.ej. https://web.allatyou.com (o http://localhost:5173 en dev)
```

**Frontend (`web/.env`)**
```
VITE_API_URL=http://localhost:3000        # o https://api.allatyou.com en producción
```

> CORS: el backend usa `WEB_ORIGIN` (y permite `http://localhost:5173` en dev) para restringir orígenes.

---

## 🗄️ Esquema SQL (Supabase)

### 1) Enum + tabla `payments`
```sql
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending','confirmed','rejected');
  end if;
end $$;

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  payer_name text not null,
  plate text not null,
  payment_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  installment_number int,
  proof_url text, -- requerido por lógica de API
  status payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_plate on public.payments (plate);
create index if not exists idx_payments_date on public.payments (payment_date);
create index if not exists idx_payments_created_at on public.payments (created_at desc);

alter table public.payments enable row level security;
```

### 2) Tabla `vehicles` (fuente para autocomplete/validación)
```sql
create table if not exists public.vehicles (
  plate text primary key,
  owner_name text not null,
  has_credit boolean not null default false,
  default_amount numeric(12,2),
  default_installment int,
  created_at timestamptz not null default now()
);

create index if not exists idx_vehicles_owner on public.vehicles (owner_name);
```

> (Opcional pronto) **FK** `payments.plate → vehicles.plate` con `on delete restrict`. Hoy validamos por lógica en la API y **bloqueamos** crear pagos con placas no registradas.

### 3) Vista `vehicle_last_payment` (último pago + mora)
```sql
create or replace view public.vehicle_last_payment as
select
  v.plate,
  v.owner_name,
  lp.payment_date,
  lp.amount,
  coalesce(lp.payment_date, v.created_at::date)                                                as ref_date,
  (now() at time zone 'America/Bogota')::date                                                   as today_bogota,
  ((now() at time zone 'America/Bogota')::date - coalesce(lp.payment_date, v.created_at::date))::int as days_since,
  (((now() at time zone 'America/Bogota')::date - coalesce(lp.payment_date, v.created_at::date)) >= 2) as is_overdue
from public.vehicles v
left join lateral (
  select p.payment_date, p.amount
  from public.payments p
  where p.plate = v.plate
  order by p.payment_date desc, p.created_at desc
  limit 1
) lp on true;
```

> **Mora** = `hoy – último_payment_date ≥ 2 días` (Bogotá).  
> Si no hay pagos, se usa `created_at` del vehículo como referencia.

### 4) Storage (comprobantes)
- **Bucket**: `comprobantes` (público OK para MVP).
- Recomendado: **restringir MIME** a `image/*` y tamaño (p. ej. ≤ 5 MB).  
- La API sube a `comprobantes/<uuid>.ext` y guarda la **URL pública** en `payments.proof_url`.

---

## ▶️ Dev (Local)

**Backend**
```bash
npm i
npm run dev
```

**Frontend**
```bash
cd web
npm i
npm run dev
# abre http://localhost:5173
```

---

## 🔌 Endpoints (API)

### POST `/uploads`
- **multipart/form-data** → `file` (imagen)
- Sube a Supabase Storage y devuelve `{ url }`.

**Ejemplo**
```bash
curl -X POST http://localhost:3000/uploads \
  -F "file=@/ruta/tu_imagen.jpg"
```

### POST `/payments`
- Requiere:
  - `payer_name` (string)
  - `plate` (formato **ABC123**, debe **existir** en `vehicles`)
  - `payment_date` (YYYY-MM-DD)
  - `amount` (number, COP)
  - `proof_url` (URL de la imagen subida)
- Opcionales: `installment_number`, `status` (default `pending`)

**Ejemplo**
```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "payer_name":"Juan Perez",
    "plate":"ABC123",
    "payment_date":"2025-10-14",
    "amount":150000,
    "installment_number":1,
    "proof_url":"https://.../comprobantes/uuid.jpg",
    "status":"pending"
  }'
```

### GET `/payments`
- Lista pagos (MVP). *(Filtros/paginación en próximo sprint)*

```bash
curl http://localhost:3000/payments
```

### GET `/drivers/:plate`
- Devuelve datos para autocomplete.
- Puede responder como `{ found:false }` o `{ found:true, driver:{...} }`.

```bash
curl http://localhost:3000/drivers/ABC123
```

### GET `/reports/last-payments`
- Último pago por vehículo + **mora**.
- Query params:
  - `q`: placa o nombre (ilike)
  - `limit` (1..100), `offset` (>=0)
  - `overdue_only=true` para ver solo morosos

```bash
curl "http://localhost:3000/reports/last-payments?q=juan&overdue_only=true&limit=20&offset=0"
```

---

## 🖥️ Web (rutas)

- `/pay` — Formulario de pago  
  - Valida placa **ABC123** (front+back)
  - Autocompleta por placa (si tiene crédito, sugiere monto/cuota)
  - Exige adjuntar **imagen** de comprobante
  - Formatea **COP** en UI

- `/reports` — Reporte (Último pago por vehículo)
  - Búsqueda por placa/nombre
  - Checkbox **“Mostrar solo en mora”**
  - Morosos en **rojo** (según regla de mora)

---

## 🎨 Tailwind v4

**web/postcss.config.js**
```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

**web/src/index.css**
```css
@import "tailwindcss";
```

---

## 🌐 Deploy

- **API**: Railway → `https://api.allatyou.com` (CNAME al subdominio de Railway)  
- **Web**: Vercel → `https://web.allatyou.com` (CNAME al proyecto Vercel)  
- **Dominios**:  
  - `api.allatyou.com` → API  
  - `web.allatyou.com` → Web  
  - `allatyou.com` → Landing (pendiente)

**Prod envs**
- Backend: `WEB_ORIGIN=https://web.allatyou.com`
- Frontend: `VITE_API_URL=https://api.allatyou.com`

---

## 🔒 Notas de seguridad
- **Nunca** expongas `SUPABASE_SERVICE_ROLE` en el front.
- CORS restringido a tu dominio web.
- Sanitiza uploads (MIME/size).
- Próximo sprint: schema validation (Zod), rate-limit, logs con `request-id`.

---

## 🧭 Roadmap (pendiente)
- **Landing** pública (pro look) en `allatyou.com` con CTA “Pagar mi cuota”.
- Filtros/paginación en `/payments` (API + UI).
- KPIs y export CSV.
- Validación automática (cron) de pagos `pending` → `validated/rejected` + auditoría.
- Hardening: FK `payments.plate → vehicles.plate`, Zod, rate-limit, métricas.
