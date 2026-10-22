# Spec — Utilidades y Rentabilidad (`/profit`)

**Estado:** Vigente · **Última revisión:** 2026-10-22
**Código principal:** `src/routes/profit.ts` (montado en `/reports`), `web/src/pages/AdminProfit.tsx`
**Vistas SQL:** `vehicle_month_adjustments`, `vehicle_month_profit`, `vehicle_cumulative_profit`, `vehicle_breakeven_status` (`docs/Database_Updates.sql`); `vehicle_month_income`, `vehicle_month_expense`, `vehicle_investment_total` (solo en Supabase, **no versionadas** en el repo).
**Relacionado:** `pagos.md` §3 (reparto del pago), `gastos-fondo-mantenimiento.md` (gastos y fondo), `leasing.md` §4–5.

---

## 1. Concepto

Panel interno (Basic Auth + `CompanyLock`) para ver cuánto deja cada vehículo. Tiene tres pestañas: **Mensual**, **Diario** y **Rentabilidad**. Mensual y Rentabilidad usan la misma fórmula por placa; Diario es un flujo de caja de toda la flota (§4).

## 2. Fórmula de utilidad por vehículo (Mensual y Rentabilidad)

| Concepto | Regla |
|---|---|
| **Ingresos** (`pure_income`) | `SUM(payments.delivery_amount)` de pagos `confirmed`, por `payment_date`. Incluye el recargo por mora abonado (`late_fee_paid` es parte de `delivery_amount`, ver `pagos.md` §3). |
| **Gastos** (`expense`) | `SUM(expense_vehicles.share_amount)`: la parte prorrateada del gasto que le toca a la placa, por `expenses.date`. |
| **Ajustes** (`adjustments`) | `vehicle_ledger` por `date`: `extra_income` +amount, `extra_expense` −amount, `correction` +amount, `opening_balance` **0** (un saldo inicial no es utilidad del periodo). Regla de la vista `vehicle_month_adjustments`, verificada contra Supabase el 2026-10-22 con montos positivos y negativos. |
| **Utilidad neta** (`profit` / `net_profit`) | Ingresos − Gastos + Ajustes |

- **No suman a la utilidad** (columnas informativas de la Mensual): `deposits_total` (= `insurance_amount`, depósito del conductor), `advances_total` (= `credit_installment_amount` de pagos con `installment_number`, recuperación de anticipos) y `maintenance_provision` (= `maintenance_amount`, provisión de mantenimiento de renting).
- En Mensual la fórmula se calcula en la vista `vehicle_month_profit`. En Rentabilidad se recalcula en JS (`/reports/profitability`) con la misma regla. **Si cambia una, hay que cambiar la otra.**
- **Vehículos en leasing (decisión 2026-10-22, provisional):** se usa la misma fórmula, con `delivery_amount` como ingreso, aunque en leasing ese reparto no es el real (`pagos.md` §3; el real está en `payment_distributions`: mantenimiento $10.000, admin, interés, capital). Efecto conocido y aceptado por ahora: la utilidad de un vehículo en leasing incluye el abono a capital (que es recuperación de la inversión) y la provisión de mantenimiento queda en $6.000 en vez de $10.000. Ver §7.
- Aparecen todas las placas de `vehicles`, incluso con $0 de actividad. Los pagos, gastos o ajustes de placas que no están en `vehicles` no se muestran.

## 3. Pestañas

### Mensual (`GET /reports/profit?month=YYYY-MM&plate=`)
- Una fila por placa para el mes, con la utilidad de §2 y las columnas informativas.
- **Inversión / Restante / Liberado** (`vehicle_breakeven_status`): Restante = máx(inversión − utilidad acumulada histórica, 0); Liberado = la utilidad acumulada ya cubrió la inversión. Se calcula con **todo el histórico**, no con el mes consultado.
- **Fondo Mant. (Hoy):** ver §5.
- Desde la fila se abren el detalle de ingresos/gastos (`/reports/income-detail`, `/reports/expense-detail`) y el editor de ajustes (`/ledger`).

### Rentabilidad (`GET /reports/profitability?period=day|week|month&date=&month=&plate=`)
- Tarjetas (ingresos, gastos, utilidad neta, margen), un gráfico de líneas por día y una tabla por placa con margen % = utilidad neta / ingresos (`—` si no hubo ingresos).
- Períodos (hora Colombia, UTC−5):
  - **Día:** la tabla muestra la fecha elegida y el gráfico los 7 días que terminan en ella.
  - **Semana:** los 7 días `[fecha − 6, fecha]`, igual en tabla y gráfico.
  - **Mes:** el mes calendario. Si es el mes en curso, el gráfico se corta en hoy para no pintar días futuros en $0; la tabla sí cubre el mes completo.
- Los detalles de ingresos/gastos se abren con el mismo rango de fechas de la tabla (`from`/`to`).

### Filtros comunes
- **Placa:** aplica a Mensual y Rentabilidad. Recarga al borrar el filtro o al escribir una placa de 6 caracteres.
- **Incluir vehículos inactivos/vendidos:** al desmarcarlo se ocultan las placas `sold` e `inactive`; totales y gráfico se recalculan sin ellas (la serie trae `active_*` para esto).

## 4. Pestaña Diario (`GET /reports/daily?month=YYYY-MM`) — flujo de caja de la flota

**No es la misma fórmula que §2.** Es el flujo del mes día por día para **toda la flota**, sin filtro de placa:
- Ingresos = `SUM(delivery_amount)` de los pagos confirmados de ese día (de cualquier placa).
- Gastos = `SUM(expenses.total_amount)` (total del gasto, no la parte prorrateada).
- **No incluye ajustes** de `vehicle_ledger`.
- Utilidad del día = ingresos − gastos.

Por eso el total de Diario puede no coincidir con la suma de la Mensual del mismo mes.

## 5. Fondo de mantenimiento en el panel

La columna **Fondo Mant. (Hoy)** muestra el **saldo disponible actual** (`maintenance_fund_available` de `leasing_contracts_summary_vw`) del contrato de leasing `active`, sin importar el mes o la fecha consultados. Sin contrato `active` (renting, `cancelled`, `closed`) se muestra `—`. No suma a la utilidad. Reglas del fondo: `gastos-fondo-mantenimiento.md` §2.

## 6. Reglas técnicas

- Las consultas de filas crudas (`payments`, `expenses`, `vehicle_ledger`, `vehicle_cumulative_profit`) se paginan en bloques de 1.000 (`fetchAllRows`, con orden determinístico) para que PostgREST no las corte en silencio. Toda consulta nueva de filas crudas en este módulo debe paginarse igual.
- "Hoy" se calcula en hora Colombia (`todayCol()`, UTC−5) en el backend y en el frontend.
- En la UI, cada carga (Mensual, Diario, Rentabilidad y detalle) cancela la petición anterior y descarta respuestas atrasadas, para que la pantalla siempre corresponda al último filtro elegido.

## 7. Preguntas abiertas

- **Utilidad real de leasing (pendiente):** por ahora se usa `delivery_amount` (§2). Queda por definir si más adelante el ingreso de leasing se mide desde `payment_distributions` (p. ej. interés + admin, sin capital).
- Versionar en el repo la definición de `vehicle_month_income`, `vehicle_month_expense` y `vehicle_investment_total` (hoy solo existen en Supabase).
- ¿La pestaña Diario debe alinearse con §2 (gasto prorrateado + ajustes) o se mantiene como flujo de caja?
