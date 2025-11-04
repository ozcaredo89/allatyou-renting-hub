# AllAtYou Renting Hub

Monorepo con **API (Express + TypeScript + Supabase)** y **Web (Vite + React + Tailwind v4)** para registrar **pagos, gastos y anticipos (préstamos operativos)**, subir comprobantes y generar reportes de **mora, utilidad mensual y ledger contable**.

---

## 🚀 Tech Stack

- **API**: Node.js (Express 5 + TypeScript + Supabase SDK)  
- **DB**: Supabase (PostgreSQL + Storage)  
- **Web**: Vite + React + TypeScript + Tailwind v4  
- **Infraestructura**: Railway (API) + Vercel (Web)  
- **Storage**: Supabase bucket `comprobantes/soportes` (soportes y adjuntos)

---

## 📦 Estructura

```
allatyou-renting-hub/
├─ src/                     # API (Express + TypeScript)
│  ├─ index.ts              # bootstrap + middlewares
│  ├─ lib/supabase.ts       # cliente Supabase service role
│  └─ routes/
│     ├─ payments.ts        # /payments CRUD + uploads
│     ├─ expenses.ts        # /expenses + prorrateo
│     ├─ reports.ts         # /reports/last-payments y /profit
│     ├─ profit.ts          # utilidades mensuales
│     ├─ investments.ts     # inversión base por placa
│     ├─ ledger.ts          # ajustes contables (+/-)
│     ├─ noPay.ts           # reglas "no paga hoy"
│     └─ advances.ts        # NUEVO — anticipos operativos
├─ web/
│  ├─ src/App.tsx           # Router principal
│  └─ src/pages/
│     ├─ Pay.tsx
│     ├─ Expenses.tsx
│     ├─ Reports.tsx
│     ├─ AdminProfit.tsx
│     └─ AdminAdvances.tsx  # NUEVO — módulo de préstamos
└─ .env / web/.env
```

---

## 🔐 Variables de entorno

**Backend (`.env`):**
```bash
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE=<service-role-key>  # nunca exponer en frontend
PORT=3000
WEB_ORIGIN=https://web.allatyou.com
ADMIN_BASIC_USER=<usuario>
ADMIN_BASIC_PASS=<contraseña>
```

**Frontend (`web/.env`):**
```bash
VITE_API_URL=https://api.allatyou.com
```

> CORS restringido por `WEB_ORIGIN`.

---

## 🧮 Base de datos (Supabase)

### Pagos (`payments`)
Pagos realizados por conductores, con validación de placa, comprobante y estado (`pending`, `confirmed`, `rejected`).

### Gastos (`expenses`, `expense_vehicles`)
Gastos prorrateados por vehículo, con auditoría (`expense_audit_log`).

### Ledger contable (`vehicle_ledger`)
Ajustes manuales (ingresos/egresos contables) integrados al cálculo mensual de profit.

### Inversiones (`vehicle_investments`)
Capital base por vehículo, usado para calcular recuperación (% recovered).

### Anticipos operativos (`operational_advances`, `operational_advance_schedule`)
Nuevo módulo para préstamos a conductores o colaboradores.  
- `operational_advances`: registra el préstamo (monto, tasa total, cuotas, fecha, persona).  
- `operational_advance_schedule`: cronograma generado automáticamente con cuotas fijas y fechas de pago.  
- Campo `daily_installment` (entero, redondeado a centenas) definido por el usuario desde la UI.  
- Cálculo base: monto × (1 + tasa%) ÷ cuotas → redondeado hacia arriba a múltiplos de 100.  

### Vistas sugeridas
- `vehicle_last_payment`: última fecha de pago + mora (rojo si >1 día)
- `vehicle_month_profit`: income, expense, ledger_net, profit, remaining

---

## 📡 Endpoints principales

| Método | Ruta | Descripción |
|--------|------|--------------|
| `POST` | `/payments` | Crear pago (valida placa, adjunta comprobante) |
| `GET`  | `/reports/last-payments` | Último pago por vehículo + mora |
| `POST` | `/expenses` | Crear gasto y prorratear entre placas |
| `GET`  | `/reports/profit` | Utilidad mensual con ledger |
| `POST` | `/ledger` | Registrar ajuste contable |
| `POST` | `/advances` | Crear anticipo operativo y cronograma |
| `GET`  | `/advances` | Listar anticipos (filtros: estado, persona, placa) |
| `GET`  | `/advances/:id/schedule` | Obtener cronograma |
| `POST` | `/advances/:id/payments` | Marcar cuota pagada |

---

## 🖥️ Web (rutas)

- `/pay` — formulario de pago (autocompleta placa, valida, adjunta comprobante).  
- `/expenses` — gastos multi-placa, prorrateo exacto, confirmación por WhatsApp.  
- `/reports` — últimos pagos por vehículo (filtros y mora).  
- `/admin/profit` — utilidad mensual con detalle de ingresos, gastos y ledger.  
- `/admin/advances` — **nuevo módulo** para crear, listar y gestionar anticipos.

---

## 🧭 Roadmap actual

✅ Pagos (MVP)  
✅ Gastos (multi-placa)  
✅ Reportes (último pago, mora)  
✅ Profit mensual (con ledger base)  
✅ Anticipos operativos (back + UI completa)  
⏳ Integración ledger automática (advance_outflow / advance_repayment)  
⏳ Toasters globales  
⏳ Filtros y paginación en gastos/pagos  
⏳ Reemplazar Basic Auth por Auth real (roles)

---

## ⚙️ Dev local

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
```
Abrir: [http://localhost:5173](http://localhost:5173)

---

## 🌐 Deploy

- **API:** Railway → `https://api.allatyou.com`  
- **Web:** Vercel → `https://web.allatyou.com`  
- **Dominios activos:**  
  - `api.allatyou.com` (CNAME a Railway)  
  - `web.allatyou.com` (CNAME a Vercel)

---

## 🧾 Licencia
Privado © AllAtYou Renting S.A.S. — Uso interno.
