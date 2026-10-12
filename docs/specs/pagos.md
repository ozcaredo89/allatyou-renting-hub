# Spec — Pagos diarios de conductores

**Estado:** Vigente · **Última revisión:** 2026-10-12
**Código principal:** `src/routes/payments.ts`, `src/routes/reports.ts` (aprobación), `src/lib/receiptClassification.ts`, `web/src/pages/Pay.tsx`, `web/src/pages/Reports.tsx`, `web/src/components/PaymentApprovalModal.tsx`
**Relacionado:** `leasing.md` (cascada), `anticipos.md`

---

## 1. Concepto

Cada día pagable el conductor paga una tarifa diaria por el vehículo. El pago se registra con comprobante (foto de transferencia) en `payments`.

- `payment_date` = **día que se está pagando** (no el día en que llegó el dinero). En mora, la UI asigna el día pendiente más antiguo.
- **Mora** = días pagables desde el último `payment_date` (`vehicle_last_payment.days_since`). Los días no pagables (Pico y Placa, no-pay) no cuentan.
- Montos en **pesos COP enteros**.
- `/payments` es **público** (sin Basic Auth) porque lo usan los conductores. Cualquier acción administrativa sobre pagos (aprobar, conciliar) va en rutas con `basicAuth` (ej. `/reports/payments/...`).

## 2. Estados (`payments.status`)

| Estado | Significado |
|---|---|
| `pending` | Registrado, pendiente de aprobación por un admin. Es el valor por defecto del formulario. |
| `confirmed` | Aprobado. Solo los confirmados se aplican al cronograma de leasing. |
| `rejected` | Rechazado. No toca cronogramas. |

## 3. Reparto del pago (renting)

Para vehículos **sin leasing**, cada pago se reparte en columnas de `payments`:

| Columna | Regla automática |
|---|---|
| `insurance_amount` (seguro/depósito) | $5.000 si el monto ≥ $5.000 |
| `maintenance_amount` (provisión mtto.) | min($6.000, resto) |
| `delivery_amount` (ingreso neto) | todo el remanente (sin tope desde el fix #5229) |
| `credit_installment_amount` (cuota de anticipo) | Parte del pago diario que se abona a la cuota del anticipo activo. **Regla:** se toma del valor diario del anticipo activo (`operational_advance_schedule.installment_amount` de la cuota `installment_number`). |

- `installment_number` = número de la cuota del anticipo que se paga con este pago.
- **Detección y sugerencia automática:** Al consultar datos de la placa (`GET /drivers/:plate`), la API revisa si existe un anticipo operativo activo (`status = 'active'`). Si existe:
  - Marca `has_credit: true`.
  - Sugiere `default_installment` consultando la cuota pendiente más antigua en `operational_advance_schedule` (`status != 'paid'`, ordenada por `installment_no ASC limit 1`), con fallback a `current_installment + 1`.
  - Sugiere `default_amount = tarifa_base + daily_installment` (ej. $70.000 + $30.000 = $100.000).
  - Retorna `credit_daily_installment` para alimentar el auto-desglose del formulario en frontend.
- **Cálculo automático de `credit_installment_amount`:** Cuando se envía `installment_number` y hay un anticipo activo:
  - Si el monto cubre tarifa base + cuota (ej. monto ≥ $100.000): `credit_installment_amount` toma el valor de la cuota del cronograma (`operational_advance_schedule.installment_amount`), el resto ($70.000+) se distribuye en seguro ($5.000), mantenimiento ($6.000) y delivery (remanente completo), y la cuota queda `paid`.
  - Si el monto no alcanza para tarifa + cuota (monto < tarifa base + cuota esperada): la cuota queda `pending`, `credit_installment_amount = 0`, se registra el faltante (`installment_shortfall`) y la alerta `AMOUNT_LT_70000_INSTALLMENT_PENDING`.
- **Canon de arrendamiento base del negocio:** En vehículos de renting tradicional, el canon diario estándar es de **$70.000 COP** (salvo tarifa específica configurada en `vehicles.default_amount`).
- **Pagos con cuota sin anticipo activo o sobrepago sobre canon (decisión 2026-10-12):**
  - Si un pago registra `installment_number` pero el vehículo **NO** tiene ningún anticipo activo (`operational_advances` con `status = 'active'`):
    - No es una restricción bloqueante: el pago se registra y `can_approve` permanece en `true`.
    - Al no haber anticipo activo al cual abonar, `credit_installment_amount` queda en 0 y el excedente se asigna a canon/entrega.
    - En la pantalla de aprobación (`approval-preview`), el sistema emite una **Alerta de Conciliación** visible informando que el vehículo no tiene anticipo activo y que todo el monto extra se asignó a Canon y $0 a anticipo. Esto alerta al auditor sobre un posible anticipo otorgado que no se ha creado aún en el sistema.
  - Si el monto pagado de renting supera el canon base ($70.000) sin tener anticipo activo, la pantalla de aprobación también emite la alerta indicando la diferencia sobre el canon habitual.
- **Pagos menores a $70.000:** pueden ocurrir por realidades del negocio (pago parcial, acuerdo con el conductor). Se aceptan, pero el pago debe llevar una **nota que explique el motivo** y cómo se repartió.
- Los overrides manuales no pueden ser negativos. Sin cuota, la suma no puede superar el monto.
- Para vehículos **con leasing**, estas columnas **no** representan el reparto real; ver `leasing.md` §4.

## 4. Comprobante y antifraude

1. El conductor sube la imagen (`POST /uploads`) → OCR extrae referencia, monto, fecha (`receipt_uploads`).
2. Al registrar el pago se valida:
   - el comprobante existe y **no fue usado** en otro pago (también se protege contra carreras al enlazar `linked_payment_id`);
   - **duplicado por referencia** (normalizada) o por **mismo monto + fecha + placa**;
   - el **monto leído** por OCR coincide con el ingresado.
3. Si hay alertas, la primera vez responde **409 `RECEIPT_WARNING`**. Si el usuario confirma (`skip_receipt_check`), el pago se guarda marcado como `suspicious_duplicate` o `suspicious_amount_mismatch` según la causa real.
4. Comprobante "VEHÍCULO SIN CONDUCTOR": se acepta con monto $0 solo si el vehículo ya no tiene conductor asignado (`current_driver_id`).
5. Pago de **$1** = marcador de día en taller/mantenimiento (no se cruza con leasing).

Clasificación para reportes: `classifyReceipt` (`receiptClassification.ts`) separa sospechosos (duplicados, operacional) de fallas técnicas de OCR.

## 5. Aprobación de pagos pendientes

Pantalla Reports: aviso con el conteo global de pendientes, filtro `pending_only` y modal de aprobación.

- `GET /reports/payments/:id/approval-preview` muestra el reparto que se aplicará.
- `POST /reports/payments/:id/approve`:
  - **Leasing:** aplica la cascada estricta (cuota con `due_date = payment_date`). Si no hay cuota o ya está pagada, `can_approve = false`. Si la cascada falla, el pago **no** se confirma (422).
  - **Renting:** respeta el reparto guardado al crear el pago; solo cambia el `status`. Si el pago tiene `installment_number` y `credit_installment_amount > 0`, marca la cuota como `paid` en `operational_advance_schedule`, sincroniza `operational_advances.current_installment = paidCount` y cierra el anticipo si se completaron todas las cuotas.
  - Nunca recalcula ni inventa montos.

## 6. Otros flujos

- **Pago por lote (multi-día):** `batch_mode` en `POST /payments`. RPC `create_payment_batch` inserta todo atómicamente; si la cascada de leasing falla, se borra el lote completo. La previsualización (`GET /payments/batch-preview`) es la misma lógica que usa el backend.
- **Pagar mora con anticipo:** `POST /payments/pay-with-advance` crea N pagos confirmados (`receipt_status = 'advance_offset'`, referencia `ANTICIPO-{id}-{fecha}`) por la tarifa diaria, siempre que el total no supere el monto del anticipo. El anticipo es dinero entregado al conductor: una parte se usa para pagar los días atrasados y **lo que sobre queda en manos del conductor**. **No se lleva saldo** del anticipo (decisión 2026-10-12).
- **Deshacer último pago:** `DELETE /payments/last/:plate` (revierte también el estado de la cuota de anticipo asociada).
- **Tarifa diaria** (`resolveDailyRentRate`): `drivers_vw.default_amount` → cuota pendiente de leasing → último pago → contrato pendiente → $70.000 por defecto.

## 7. Pendientes de desarrollo (brechas entre la regla y el código)

- **Asignación retroactiva de cuota en conciliación:** Si un pago entró sin `installment_number` pero el conductor pagó el monto completo de canon + anticipo, permitir en la pantalla de aprobación asignar la cuota pendiente antes de confirmar.
