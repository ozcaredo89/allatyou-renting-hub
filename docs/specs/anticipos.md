# Spec — Anticipos operativos (préstamos a conductores)

**Estado:** Vigente · **Última revisión:** 2026-10-12
**Código principal:** `src/routes/advances.ts`, helpers en `src/routes/payments.ts` (`ensureScheduleRow`, `applyScheduleStatus`, `maybeCloseAdvance`)
**Tablas:** `operational_advances`, `operational_advance_schedule`

---

## 1. Concepto

Un **anticipo operativo** es dinero que la empresa presta a un conductor (o colaborador) y que se recupera en **cuotas diarias** junto con el pago diario.

- `person_type`: `driver` o `collaborator`.
- Valores por defecto al crear desde `/advances`: tasa 15%, 21 cuotas. La cuota diaria (`daily_installment`) se envía explícitamente.
- **Regla: máximo un anticipo `active` por placa** (índice único `uidx_operational_advances_one_active_per_plate` + validación previa en la API).
- Estados: `active` → `closed` (todas las cuotas pagadas) o `cancelled`.

## 2. Cronograma

- Se genera al crear el anticipo: una cuota por día calendario desde `start_date` (`installment_no` 1..N).
- Si falla el cronograma, se borra el anticipo (no quedan anticipos sin cuotas).
- Al editar la `due_date` de una cuota no pagada, las siguientes no pagadas se recalculan en cascada.
- El anticipo se cierra automáticamente cuando no quedan cuotas pendientes (`maybeCloseAdvance`).

## 3. Cómo se pagan las cuotas

- Desde un pago diario con `installment_number` (ver `pagos.md` §3): `credit_installment_amount` es lo que se abona a la cuota y **debe salir del valor de la cuota en el cronograma** (hoy se llena a mano; pendiente de desarrollo). Si el pago es `rejected`, no toca el cronograma.
- Directamente: `POST /advances/:id/payments` marca una cuota pagada y actualiza `current_installment`.
- Si hay más de un anticipo activo para la placa, el pago se rechaza con 400 (no debería pasar por la regla del índice único).

## 4. Anticipos originados en otros módulos

| Origen | Características |
|---|---|
| Excedente de una Nota Débito de mantenimiento (`gastos-fondo-mantenimiento.md`) | Tasa 0%, N cuotas (default 10) que suman exactamente el excedente, nota "Excedente de mantenimiento por gasto(s): …" |
| Pago de mora con anticipo (`pagos.md` §6) | Usa un anticipo existente para cubrir días de renta atrasados |

**No hay saldo de anticipo.** El anticipo es dinero que se entrega al conductor; parte puede destinarse a pagar entregas atrasadas y el excedente queda en manos del conductor. No se registra cuánto se usó ni cuánto sobró (decisión 2026-10-12). Lo único que se controla es que lo pagado con el anticipo no supere su monto.

## 5. Relación con leasing

- Pago = cuota de leasing + (opcional) cuota de anticipo.
- Por ahora el **excedente** de un pago de leasing **no** se abona automáticamente al anticipo (decisión 2026-10-03, ver `leasing.md` §4).

## 6. Preguntas abiertas

- ¿Cómo se calcula `daily_installment` cuando hay tasa (15%)? Hoy viene del frontend; documentar la fórmula oficial.
- ¿Las cuotas de anticipo deben respetar días no pagables (Pico y Placa) como las de leasing? Hoy son días calendario.
