# AllAtYou Renting Hub

Monorepo con **API (Express + TypeScript + Supabase)** y **Web (Vite + React + Tailwind v4)** para registrar **pagos, gastos y anticipos (préstamos operativos)**, subir comprobantes y generar reportes de **mora, utilidad mensual y ledger contable**.

---

## 🚀 Tech Stack

- **API**: Node.js (Express 5 + TypeScript + Supabase SDK)  
- **DB**: Supabase (PostgreSQL + Storage)  
- **Web**: Vite + React + TypeScript + Tailwind v4  
- **Infraestructura**: Railway (API) + Vercel (Web)  
- **Storage**: Supabase bucket `comprobantes/soportes`

---

## 📦 Estructura

allatyou-renting-hub/
├─ src/
│ ├─ index.ts
│ ├─ lib/supabase.ts
│ └─ routes/
│ ├─ payments.ts
│ ├─ expenses.ts
│ ├─ reports.ts
│ ├─ profit.ts
│ ├─ investments.ts
│ ├─ ledger.ts
│ ├─ noPay.ts
│ └─ advances.ts
├─ web/
│ ├─ src/App.tsx
│ └─ src/pages/
│ ├─ Pay.tsx
│ ├─ Expenses.tsx
│ ├─ Reports.tsx
│ ├─ AdminProfit.tsx
│ └─ AdminAdvances.tsx
└─ .env / web/.env

yaml
Copy code

---

## 🔐 Variables de entorno

**Backend (`.env`):**
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE=<service-role-key>
PORT=3000
WEB_ORIGIN=https://web.allatyou.com
ADMIN_BASIC_USER=<usuario>
ADMIN_BASIC_PASS=<contraseña>

ruby
Copy code

**Frontend (`web/.env`):**
VITE_API_URL=https://api.allatyou.com

yaml
Copy code

---

## 🧮 Base de datos (Supabase)

### Pagos (`payments`)
Registro de pagos por placa, con comprobante obligatorio y estado (`pending`,`confirmed`,`rejected`).

### Gastos (`expenses`, `expense_vehicles`)
Soporta múltiples placas, prorrateo exacto y adjuntos.

### Ledger contable (`vehicle_ledger`)
Ajustes manuales (+/-) visibles en `/admin/profit`.

### Inversiones (`vehicle_investments`)
Inversión base; usada para remaining y % recovered.

### Anticipos operativos (`operational_advances`, `operational_advance_schedule`)
- Préstamos operativos a conductores/colaboradores  
- Cronograma automático (21 cuotas por defecto)  
- `daily_installment` editable (redondeada a centenas)  
- Integración en `/admin/advances`  

---

## 📡 Endpoints principales

| Método | Ruta | Descripción |
|--------|------|--------------|
| POST | `/payments` | Crear pago |
| GET  | `/reports/last-payments` | Último pago por vehículo |
| POST | `/expenses` | Crear gasto con prorrateo |
| GET  | `/reports/profit` | Utilidad mensual |
| POST | `/ledger` | Registrar ajuste contable |
| POST | `/advances` | Crear anticipo |
| GET  | `/advances` | Listar anticipos |
| GET  | `/advances/:id/schedule` | Cronograma |
| POST | `/advances/:id/payments` | Marcar cuota pagada |

---

## 🖥️ Web (rutas)

- `/pay` — pagos (autocompletar placa, validación, comprobante).  
- `/expenses` — gastos multi-placa.  
- `/reports` — últimos pagos + mora.  
- `/admin/profit` — utilidad mensual con detalles por placa.  
- `/admin/advances` — módulo completo de anticipos operativos.

---

## 🧭 Roadmap actual

### ✔ Completo
- Pagos (MVP)
- Gastos multi-placa
- Reportes (último pago, mora)
- Profit mensual + ledger base
- Anticipos operativos (back + UI)
  
### ⏳ En progreso
- Ledger automático (outflow/repayment)
- Toasters globales
- Filtros y paginación para pagos/gastos
- Auth por roles (reemplazar Basic Auth)

---

## ⚙️ Dev local

**Backend**
npm i
npm run dev

markdown
Copy code

**Frontend**
cd web
npm i
npm run dev

yaml
Copy code

Abrir: http://localhost:5173

---

## 🌐 Deploy

- API → https://api.allatyou.com  
- Web → https://web.allatyou.com  

Dominios:
- api.allatyou.com  
- web.allatyou.com  

---

## 🧾 Licencia
Privado © AllAtYou Renting S.A.S. — Uso interno.