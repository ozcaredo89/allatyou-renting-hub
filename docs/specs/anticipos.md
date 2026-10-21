# Spec — Anticipos operativos (préstamos a conductores)

**Estado:** Vigente · **Última revisión:** 2026-10-21
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

### 2.1 Tasa y cuota (decisión 2026-10-21)

- Interés simple sobre el monto: total a pagar = `amount × (1 + rate_percent/100)`, repartido en N cuotas iguales. Cuota sugerida = total / N redondeado hacia arriba a 100.
- Tasa por defecto **15%** en todos los orígenes (incluido el excedente de Nota Débito).
- La cuota se puede ajustar a mano (redondear por comodidad); la tasa se recalcula a partir de ella: `rate = (cuota × N / amount − 1) × 100`.
- **Tasa negativa prohibida:** si cuota × N < monto, no se crea (front bloquea; API responde 400 — `src/lib/advanceRate.ts`).
- **Tasa 0% permitida con advertencia:** antes de crear se muestra cuánto queda cada cuota (y cuánto sería con 15%) y se pide confirmación para dar chance de corregir (`web/src/lib/advanceRate.ts`).
- El formulario muestra siempre el desglose: N cuotas de $X = total · interés $Y (Z%).
- Hoy el cronograma guarda cada cuota completa en `principal_amount` con `interest_amount = 0` (no se separa el interés por cuota; pendiente de definir).

### 2.2 Generación

- Se genera al crear el anticipo: una cuota por día calendario desde `start_date` (`installment_no` 1..N).
- Si falla el cronograma, se borra el anticipo (no quedan anticipos sin cuotas).
- Al editar la `due_date` de una cuota no pagada, las siguientes no pagadas se recalculan en cascada.
- El anticipo se cierra automáticamente cuando no quedan cuotas pendientes (`maybeCloseAdvance`).

## 3. Cómo se pagan las cuotas

- **Desde el pago diario con `installment_number` (ver `pagos.md` §3):**
  - Detección automática: `GET /drivers/:plate` consulta `operational_advances` en estado `active`. Si existe, reporta `has_credit: true`, prellena `default_installment` con la cuota pendiente más antigua de `operational_advance_schedule` (`status != 'paid'`, `order installment_no asc limit 1`, con fallback a `current_installment + 1`), y suma `daily_installment` a la tarifa sugerida (ej. $70.000 + $30.000 = $100.000). Retorna `credit_daily_installment` para el auto-desglose.
  - Al crearse el pago (`POST /payments`), `credit_installment_amount` toma automáticamente el valor de la cuota del cronograma (`installment_amount`) si el monto cubre tarifa + cuota, y la cuota se marca `paid` en `operational_advance_schedule`. Luego `maybeCloseAdvance` sincroniza `operational_advances.current_installment = paidCount` y cierra el anticipo (`status = 'closed'`) si se completaron todas las cuotas. Si el pago es `rejected`, no toca el cronograma.
  - Al aprobarse un pago en `pending` (`POST /reports/payments/:id/approve`), si este tiene `installment_number` y `credit_installment_amount > 0`, la cuota se marca `paid` en `operational_advance_schedule`, se sincroniza `operational_advances.current_installment = paidCount` y se cierra el anticipo si no quedan cuotas pendientes.
- **Directamente:** `POST /advances/:id/payments` marca una cuota pagada y actualiza `current_installment`.
- **Pagos que indican cuota sin anticipo activo (decisión 2026-10-12):** Si un pago ingresa con número de cuota pero la placa no tiene ningún anticipo activo en el sistema, el pago no se bloquea, pero el abono a crédito queda en 0 (remanente a canon de entrega) y la pantalla de aprobación (`/approval-preview`) emite una **Alerta de Conciliación** para advertir al administrador que puede existir un anticipo no creado en el sistema.
- Si hay más de un anticipo activo para la placa, el pago se rechaza con 400 (no debería pasar por la regla del índice único).
- **El anticipo es del conductor, no del carro (decisión 2026-10-16):** un anticipo activo solo se tiene en cuenta en el pago diario si su dueño es el conductor que tenía el carro el día pagado. Ese conductor se toma de `vehicle_assignments` según la fecha, o de `vehicles.current_driver_id` si no hay historial. El dueño del anticipo es `driver_id` o, si está vacío, el conductor cuyo `full_name` coincide con `person_name`.
  - Si no coinciden, el anticipo se ignora en la sugerencia de cuota (`GET /drivers/:plate`), en el reparto y cronograma al registrar (`POST /payments`, lotes), y en la vista, ajuste y aprobación (`/reports/payments/:id/...`).
  - Si no se puede determinar el dueño o el conductor, el anticipo se sigue teniendo en cuenta, para no bloquear.
  - Código: `src/lib/advanceOwnership.ts`.
  - Caso que lo originó: en ICV061, los pagos de Bairo Castro (desde el 26-sep) abonaron las cuotas del anticipo #92 de Brayan Luna (hasta el 26-sep).
  - Cuando el conductor dueño se va, su anticipo se cierra con base en su **liquidación**, no con los pagos del conductor siguiente.

## 4. Anticipos originados en otros módulos

| Origen | Características |
|---|---|
| Excedente de una Nota Débito de mantenimiento (`gastos-fondo-mantenimiento.md`) | Monto = excedente, tasa por defecto 15% con las reglas de §2.1, N cuotas iguales (default 10), nota "Excedente de mantenimiento por gasto(s): …". Si el cliente no envía cuota (versión vieja), se crea a 0% con cuotas que suman exactamente el excedente. |
| Pago de mora con anticipo (`pagos.md` §6) | Usa un anticipo existente para cubrir días de renta atrasados (crea pagos con `receipt_status = 'advance_offset'`). **Aclaración clave:** estos pagos saldan la deuda de renta del vehículo, pero **no** son abonos del conductor al anticipo. La amortización del conductor ocurre cuando este paga sus cuotas diarias de recuperación (ej. $30.000) junto con su canon. |

**No hay saldo de anticipo.** El anticipo es dinero que se entrega al conductor; parte puede destinarse a pagar entregas atrasadas y el excedente queda en manos del conductor. No se registra cuánto se usó ni cuánto sobró (decisión 2026-10-12). Lo único que se controla es que lo pagado con el anticipo no supere su monto.

## 5. Relación con leasing

- Pago = cuota de leasing + (opcional) cuota de anticipo.
- Por ahora el **excedente** de un pago de leasing **no** se abona automáticamente al anticipo (decisión 2026-10-03, ver `leasing.md` §4).

## 6. Preguntas abiertas

- ¿Cómo se reparte cada cuota entre interés y capital en `operational_advance_schedule`? Hoy `interest_amount = 0`.
- ¿Las cuotas de anticipo deben respetar días no pagables (Pico y Placa) como las de leasing? Hoy son días calendario.
