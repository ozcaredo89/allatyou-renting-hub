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
| `credit_installment_amount` (cuota de anticipo) | Parte del pago diario que se abona a la cuota del anticipo activo. **Regla:** debe tomarse del cronograma del anticipo (`operational_advance_schedule.installment_amount` de la cuota `installment_number`). ⚠️ Hoy el reparto automático la deja en 0 y solo se llena a mano (ver §7) |

- `installment_number` = número de la cuota del anticipo que se paga con este pago.
- Con `installment_number` y monto < $70.000: la cuota queda `pending`, se registra el faltante (`installment_shortfall`) y la alerta `AMOUNT_LT_70000_INSTALLMENT_PENDING`.
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
  - **Renting:** respeta el reparto guardado al crear el pago; solo cambia el `status` y marca pagada la cuota del anticipo si aplica.
  - Nunca recalcula ni inventa montos.

## 6. Otros flujos

- **Pago por lote (multi-día):** `batch_mode` en `POST /payments`. RPC `create_payment_batch` inserta todo atómicamente; si la cascada de leasing falla, se borra el lote completo. La previsualización (`GET /payments/batch-preview`) es la misma lógica que usa el backend.
- **Pagar mora con anticipo:** `POST /payments/pay-with-advance` crea N pagos confirmados (`receipt_status = 'advance_offset'`, referencia `ANTICIPO-{id}-{fecha}`) por la tarifa diaria, siempre que el total no supere el monto del anticipo. El anticipo es dinero entregado al conductor: una parte se usa para pagar los días atrasados y **lo que sobre queda en manos del conductor**. **No se lleva saldo** del anticipo (decisión 2026-10-12).
- **Deshacer último pago:** `DELETE /payments/last/:plate` (revierte también el estado de la cuota de anticipo asociada).
- **Tarifa diaria** (`resolveDailyRentRate`): `drivers_vw.default_amount` → cuota pendiente de leasing → último pago → contrato pendiente → $70.000 por defecto.

## 7. Pendientes de desarrollo (brechas entre la regla y el código)

- **`credit_installment_amount` automático:** desde el fix #5229 el reparto automático nunca lo asigna (backend y `Pay.tsx`), así que la cuota del anticipo solo queda `paid` si alguien escribe el crédito a mano. Debe llenarse solo con el valor de la cuota del cronograma del anticipo.
- **Reparto con monto < $70.000:** `computeInstallmentSplit` del backend asigna $6.000 a mantenimiento y el de `Pay.tsx` no, así que la UI muestra un reparto y se guarda otro. Hay que unificarlos y generar la **nota explicativa** en el pago.
