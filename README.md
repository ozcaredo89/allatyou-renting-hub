# AllAtYou Renting Hub

Backend **Express + TypeScript + Supabase** y Frontend **Vite + React + Tailwind** para registrar y listar pagos (nombre, placa, fecha, monto, cuota, comprobante, estado).

## 🚀 Tech
- **API**: Node.js, Express 5, TypeScript
- **DB**: Supabase (PostgreSQL + RLS)
- **Web**: Vite + React + Tailwind v4

## 📦 Estructura
allatyou-renting-hub/
├─ src/ # API (Express)
│ ├─ index.ts
│ ├─ routes/payments.ts
│ └─ lib/supabase.ts
├─ web/ # Frontend (Vite)
│ ├─ src/App.tsx
│ ├─ src/index.css
│ └─ .env # VITE_API_URL
├─ db/ # (opcional si guardas archivos locales)
├─ .env # SUPABASE_URL / SUPABASE_SERVICE_ROLE / PORT
└─ README.md

bash
Copy code

## 🔐 Variables de entorno
**Backend (raíz: `.env`)**
SUPABASE_URL=https://<tu-ref>.supabase.co
SUPABASE_SERVICE_ROLE=<service-role-key>
PORT=3000

bash
Copy code

**Frontend (`web/.env`)**
VITE_API_URL=http://localhost:3000

pgsql
Copy code

## 🗄️ Esquema SQL (Supabase)
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
  proof_url text,
  status payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_plate on public.payments (plate);
create index if not exists idx_payments_date on public.payments (payment_date);
create index if not exists idx_payments_created_at on public.payments (created_at desc);

alter table public.payments enable row level security;
▶️ Dev
Backend:

bash
Copy code
npm i
npm run dev
Frontend:

bash
Copy code
cd web
npm i
npm run dev
🔌 Endpoints
POST /payments

bash
Copy code
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{"payer_name":"Juan Perez","plate":"ABC123","payment_date":"2025-10-14","amount":150000,"installment_number":1,"proof_url":"https://ejemplo.com/recibo.jpg","status":"pending"}'
GET /payments

bash
Copy code
curl http://localhost:3000/payments
🎨 Tailwind v4
web/postcss.config.js

js
Copy code
export default { plugins: { '@tailwindcss/postcss': {} } }
web/src/index.css

css
Copy code
@import "tailwindcss";
🔒 Seguridad
No expongas SUPABASE_SERVICE_ROLE en el frontend.

🧭 Roadmap
 Upload de comprobante a Supabase Storage

 Filtros por placa/fecha

 Tablas vehicles y drivers + FK en payments

 Deploy (Railway/Fly.io)
