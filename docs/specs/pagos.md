# Spec — Pagos diarios de conductores

**Estado:** Vigente · **Última revisión:** 2026-10-17
**Código principal:** `src/routes/payments.ts`, `src/routes/reports.ts` (aprobación), `src/lib/receiptClassification.ts`, `web/src/pages/Pay.tsx`, `web/src/pages/Reports.tsx`, `web/src/components/PaymentApprovalModal.tsx`, `src/lib/pendingDays.ts` + `web/src/components/ResolveDaysModal.tsx` (resolver días)
**Relacionado:** `leasing.md` (cascada), `anticipos.md`

---

## 1. Concepto

Cada día pagable el conductor paga una tarifa diaria por el vehículo. El pago se registra con comprobante (foto de transferencia) en `payments`.

- `payment_date` = **día que se está pagando** (no el día en que llegó el dinero). En mora, la UI asigna el día pendiente más antiguo.
- **Gracia de mora (decisión 2026-10-17):** el día D se paga durante D+1, hasta las 4 PM (cuando empieza el recargo). El día D solo cuenta como mora desde D+1 16:00 hora Colombia: corte = hoy − 1 si son las 4 PM o más, hoy − 2 si es antes (`mora_cutoff_date()` en SQL, `src/lib/pendingDays.ts`). Hay mora con 1 día vencido o más (`is_overdue = days_since >= 1`). Migración `20261017_mora_pago_dia_vencido.sql`.
- **Mora** = días pagables desde el último `payment_date` hasta ese corte (`vehicle_last_payment.days_since`). Los días no pagables (Pico y Placa, no-pay) no cuentan. Los días en que el carro **no tenía conductor asignado** (`vehicle_assignments`, hora Colombia) tampoco cuentan; se excluyen solos (decisión 2026-10-17, ver §6 "Resolver días en mora").
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
- **Cuota que no corresponde al anticipo (decisión 2026-10-16):** al registrar un pago (`POST /payments`), si `installment_number` no es una cuota real del anticipo activo, el backend responde **409 `INSTALLMENT_WARNING`** con un mensaje claro y la cuota sugerida, que es la siguiente pendiente. Aplica cuando:
  - el número está fuera de 1..`installments` (ej. `4714`, que es la cuota de leasing 47 pegada a la cuota de anticipo 14);
  - la cuota ya está pagada;
  - el vehículo no tiene anticipo activo.

  El formulario ofrece **"Usar la cuota N y guardar"**, **"Estoy seguro, guardar con la cuota X"** (envía `confirm_installment: true`) o **"Volver y corregir"**. Si se confirma, el pago se registra con ese número, `credit_installment_amount = 0` y **sin tocar el cronograma** del anticipo, y queda registrado en el log de inconsistencias. El backend nunca crea filas en `operational_advance_schedule` fuera de 1..`installments`. Antes sí las creaba, y así se generaron las filas falsas de JHW889.
- **Pagos con cuota sin anticipo activo o sobrepago sobre canon (decisión 2026-10-12):**
  - Si un pago registra `installment_number` pero el vehículo **NO** tiene ningún anticipo activo (`operational_advances` con `status = 'active'`):
    - No es una restricción bloqueante: el pago se registra y `can_approve` permanece en `true`.
    - Al no haber anticipo activo al cual abonar, `credit_installment_amount` queda en 0 y el excedente se asigna a canon/entrega.
    - En la pantalla de aprobación (`approval-preview`), el sistema emite una **Alerta de Conciliación** visible informando que el vehículo no tiene anticipo activo y que todo el monto extra se asignó a Canon y $0 a anticipo. Esto alerta al auditor sobre un posible anticipo otorgado que no se ha creado aún en el sistema.
  - Si el monto pagado de renting supera el canon base ($70.000) sin tener anticipo activo, la pantalla de aprobación también emite la alerta indicando la diferencia sobre el canon habitual.
- **Pagos menores a $70.000:** pueden ocurrir por realidades del negocio (pago parcial, acuerdo con el conductor). Se aceptan, pero el pago debe llevar una **nota que explique el motivo** y cómo se repartió.
- **Recargo por pago tardío (decisión 2026-10-16):**
  - **Se paga a día vencido (decisión 2026-10-17):** el canon del día D se paga hasta las **4:00 PM del día D+1** (ej. el 16 se paga el 17 antes de las 4 PM). Es el mismo plazo de la mora (§1). Cuenta la **hora de la transferencia en el comprobante**, no la hora en que se registró el pago. El OCR la lee en `receipt_uploads.receipt_time` (HH:MM, 24 h) y se copia a `payments.receipt_time`.
  - A las 4:00 PM de D+1 se cobran **$5.000**, y **$5.000 más por cada hora adicional**, con un **máximo de $15.000 por día**: 4:00–4:59 PM → $5.000, 5:00–5:59 PM → $10.000, 6 PM o después → $15.000.
  - Si el día no se paga, queda debiendo canon + recargo máximo (ej. $70.000 + $15.000 = $85.000). Al día siguiente debe ese saldo más el canon del día vencido, y la regla se vuelve a aplicar sobre ese día desde las 4:00 PM.
  - **No aplica a vehículos en leasing**, ni a pagos en $0 (vehículo sin conductor) ni a días en mantenimiento (§5.1 pone el recargo en 0).
  - **Registro (decisión 2026-10-16): deuda aparte del canon.** El canon se registra completo y el recargo se lleva en dos columnas de `payments` (cálculo en `src/lib/lateFee.ts`):
    - `late_fee_amount` = recargo causado para `payment_date`, comparando con la fecha y hora de la transferencia: transferencia el día D o antes → $0 (pago adelantado); el día D+1 → según la hora; de D+2 en adelante → $15.000 (el día no se pagó). `NULL` = no se pudo calcular porque el comprobante no tiene fecha u hora legible; la aprobación lo muestra para revisarlo en la imagen. En leasing = 0.
    - `late_fee_paid` = parte del recargo que se abona con este pago: el **excedente sobre canon + cuota de anticipo**, hasta el valor del recargo. Es una **parte de `delivery_amount`** (no se descuenta de ahí), así las vistas de utilidad no cambian. Ej.: $80.000 a las 5 PM → canon $70.000, `late_fee_amount = 10.000`, `late_fee_paid = 10.000`. $70.000 a las 5 PM → `late_fee_paid = 0` y quedan debiendo $10.000.
    - Si el pago trae override manual del reparto, `late_fee_paid = 0`.
    - **Pago por lote:** cada día lleva su `late_fee_amount`; cada día paga su tarifa exacta, así que `late_fee_paid = 0`.
    - Ajuste en aprobación (§5.0) recalcula `late_fee_paid` con el nuevo monto.
  - Se muestra en el formulario de pago (aviso de la regla y, al guardar, recargo causado / abonado / pendiente) y en el modal de aprobación (`approval-preview` devuelve `late_fee` y `breakdown.late_fee`; el canon se muestra sin la parte del recargo).
- Los overrides manuales no pueden ser negativos. Sin cuota, la suma no puede superar el monto.
- Para vehículos **con leasing**, estas columnas **no** representan el reparto real; ver `leasing.md` §4.

## 4. Comprobante y antifraude

1. El conductor sube la imagen (`POST /uploads`) → OCR extrae referencia, monto, fecha (`receipt_uploads`).
2. Al registrar el pago se valida:
   - el comprobante existe y **no fue usado** en otro pago (también se protege contra carreras al enlazar `linked_payment_id`);
   - **duplicado por referencia** (normalizada) o por **mismo monto + fecha + placa**;
   - el **monto leído** por OCR coincide con el ingresado.
3. Si hay alertas, la primera vez responde **409 `RECEIPT_WARNING`**. Si la discrepancia es de monto (`amount_mismatch`), el formulario de registro (`Pay.tsx`) ofrece ajustar automáticamente el monto al valor leído del comprobante (`Ajustar y guardar` o `Ajustar en formulario`), registrándose con el monto verificado sin inconsistencia. Si el usuario decide forzar el monto digitado (`skip_receipt_check`), el pago se guarda marcado como `suspicious_duplicate` o `suspicious_amount_mismatch` según la causa real.
4. Comprobante "VEHÍCULO SIN CONDUCTOR": se acepta con monto $0 solo si el vehículo ya no tiene conductor asignado (`current_driver_id`).
5. **Día en mantenimiento** = pago confirmado en **$0** con `receipt_status = 'maintenance_day'` y nota obligatoria en `payments.notes` (ver §5.1). Reemplaza el antiguo marcador de **$1**, que se usaba porque la UI no permitía $0; los pagos históricos de $1 se siguen leyendo igual. No se cruza con leasing ni con anticipos.

Clasificación para reportes: `classifyReceipt` (`receiptClassification.ts`) separa sospechosos (duplicados, operacional) de fallas técnicas de OCR.

## 5. Aprobación de pagos pendientes

Pantalla Reports: aviso con el conteo global de pendientes, filtro `pending_only` y modal de aprobación.

- `GET /reports/payments/:id/approval-preview` muestra el reparto que se aplicará.
- `POST /reports/payments/:id/approve`:
  - **Leasing:** aplica la cascada estricta (cuota con `due_date = payment_date`). Si no hay cuota o ya está pagada, `can_approve = false`. Si la cascada falla, el pago **no** se confirma (422).
  - **Renting:** respeta el reparto guardado al crear el pago; solo cambia el `status`. Si el pago tiene `installment_number` y `credit_installment_amount > 0`, marca la cuota como `paid` en `operational_advance_schedule`, sincroniza `operational_advances.current_installment = paidCount` y cierra el anticipo si se completaron todas las cuotas.
  - Nunca recalcula ni inventa montos.

### 5.0 Ajustar el pago antes de aprobar (decisión 2026-10-16)

En el modal de aprobación, **"Ajustar monto o cuota del anticipo"** permite corregir un pago `pending` sin aprobarlo:

- `GET /reports/payments/:id/adjust-info` devuelve el monto actual, el que leyó el comprobante (`ocr_amount`), el canon del día y el anticipo activo (cuota diaria, pagadas, siguiente pendiente). El canon del día es la cuota de leasing de esa fecha o, si no hay leasing, `vehicles.default_amount` / $70.000.
- `POST /reports/payments/:id/adjust` `{ amount?, installment_number?, notes? }`:
  - La cuota debe existir en el anticipo activo y no estar pagada. Si no, responde 400 con la cuota sugerida. `null` quita la cuota.
  - Recalcula el reparto (§3): la cuota solo se abona si `amount ≥ canon + cuota`. Si no alcanza, queda `pending` con el faltante.
  - Si el monto queda **menor que el canon**, la nota es obligatoria.
  - Si el monto ahora coincide con el comprobante, se quita la alerta `suspicious_amount_mismatch`.
  - Agrega a `notes` qué cambió (monto y cuota, antes → después). No toca el cronograma: la cuota se marca pagada al **aprobar**.
- **Ajuste de un clic (decisión 2026-10-17):** si el pago `pending` tiene un monto distinto al del comprobante (`ocr_amount`), el modal de aprobación lo avisa arriba con el botón **"Ajustar a $X"**.
  - El botón llama a `adjust` con el monto del comprobante, la misma cuota y sin nota.
  - Si el ajuste necesita nota (monto menor que el canon) o la cuota no es válida, abre el formulario de ajuste con el monto ya puesto y el motivo del error.

### 5.1 Marcar como día en mantenimiento (decisión 2026-10-16)

Botón **"En mantenimiento"** en el modal de aprobación. Sirve cuando el conductor registra un día con soporte de mantenimiento en lugar de una transferencia (ej. imagen "MANTENIMIENTO").

- `GET /reports/payments/:id/maintenance-check` consulta TallerPro (`GET {TALLERPRO_API_URL}/v1/vehiculos/{placa}/historial`, header `X-API-Key: TALLERPRO_API_KEY`, cliente en `src/lib/taller.ts`). Cada ingreso no cancelado es una **estadía** `[fecha_ingreso, fecha_salida]`, en días de hora Bogotá y ambos inclusive. `fecha_salida` sale de la bitácora; si sigue en el taller, el rango llega hasta hoy. Mientras se consulta, la UI muestra "Consultando en el taller...".
- **La validación es best-effort:** si TallerPro no responde (sin key, timeout de 3 s, error), no se muestra nada y el flujo sigue igual que si la integración no existiera. La nota queda opcional. Los fallos solo quedan en el log (TODO: tarea de reporte de errores).
- **Validación del día D (`payment_date`) (decisión 2026-10-16):**
  - D dentro del rango de alguna estadía → **sin warning**, aunque haya otros días marcados: una estadía de varios días cubre varios días de mantenimiento.
  - D fuera de todo rango → warning con detalle: la estadía más cercana (entrada, salida, motivo) y las últimas estadías.
  - Además, si la estadía más cercana está a **más de 3 días** de D → warning "fecha muy lejana".
  - Además, si D ya tiene otro pago no rechazado de la misma placa → warning "fecha ya usada". Esto solo se evalúa cuando D está fuera de rango.
- `POST /reports/payments/:id/mark-maintenance` `{ notes }`:
  - Solo para pagos `pending` y sin abono a cuota de anticipo (`credit_installment_amount = 0`).
  - Sin warnings: la nota se arma con la estadía que cubre el día (id, entrada, salida, motivo) y la nota del usuario es opcional.
  - Con warnings: se puede guardar igual, pero la nota es **obligatoria** (mín. 10 caracteres): qué mantenimiento es y por qué no se hace en el taller. Sin nota, responde 422.
  - El pago queda en `amount = 0`, todo el reparto en 0, sin `installment_number`, `receipt_status = 'maintenance_day'`, `status = 'confirmed'`. La nota guarda el monto original que se había registrado.

## 6. Otros flujos

- **Pago por lote (multi-día):** `batch_mode` en `POST /payments`. RPC `create_payment_batch` inserta todo atómicamente; si la cascada de leasing falla, se borra el lote completo. La previsualización (`GET /payments/batch-preview`) es la misma lógica que usa el backend.
- **Pagar mora con anticipo:** `POST /payments/pay-with-advance` crea N pagos confirmados (`receipt_status = 'advance_offset'`, referencia `ANTICIPO-{id}-{fecha}`) por la tarifa diaria, siempre que el total no supere el monto del anticipo. El anticipo es dinero entregado al conductor: una parte se usa para pagar los días atrasados y **lo que sobre queda en manos del conductor**. **No se lleva saldo** del anticipo (decisión 2026-10-12).
- **Resolver días en mora (decisión 2026-10-17):** todo día pagable sin pago debe quedar resuelto. En Reportes, el botón **"Resolver días"** reemplaza a "Pagar con anticipo" y abre una sola ventana que lista cada día pendiente con **quién tenía el carro ese día** (`vehicle_assignments`). Se resuelve por día o por rango, eligiendo el motivo:
  1. **Mantenimiento:** el carro estuvo en el taller. Es un día de $0 con la validación contra TallerPro de §5.1: rango entrada → salida, fecha lejana, fecha usada.
  2. **Sin conductor:** el carro no tenía quién lo manejara.
     - Si el día no tiene conductor asignado en `vehicle_assignments`, se excluye **solo** de la mora y no hay que registrar nada.
     - Si el sistema todavía tiene un conductor asignado ese día, la ventana pide **quitar primero la asignación** del conductor, y entonces el día queda sin conductor.
  3. **Descuento en liquidación:** el día lo debe el conductor que tenía el carro y se cobra o descuenta en **su** liquidación. El día deja de contar como mora de la placa y queda como deuda de ese conductor. **Monto (decisión 2026-10-17):** canon del día + recargo máximo de $15.000, como un día sin pagar (§3). En leasing no hay recargo. Si el conductor ya tiene una liquidación cerrada, la deuda queda aparte: no se suma a esa liquidación.
  4. **Pago con anticipo:** el flujo actual (`pay-with-advance`), sin cambios.
  - La mora de la placa no se le cobra al conductor actual por días de un conductor anterior: esos días se resuelven con alguna de estas opciones, normalmente "descuento en liquidación".
  - Caso que lo originó: en UGP771, Juan Camilo Millán tuvo el carro hasta el 16-oct a las 7 PM y dejó sin pagar del 12 al 16-oct. Santiago Londoño lo recibió ese día y solo debe desde el 17-oct.
  - **Cómo se calcula (código):**
    - Mora en SQL: `get_payable_days` excluye los días sin conductor (`supabase/migrations/20261017_mora_sin_conductor.sql`). Un día D tiene conductor si alguna fila de `vehicle_assignments` de la placa cubre D: `start_date ≤ D` y `end_date` vacío o `≥ D`, en días de hora Colombia. Si la placa no tiene ninguna fila en `vehicle_assignments`, se usa `vehicles.current_driver_id` para todos los días, el mismo criterio de `driverOnDate`.
    - Días pendientes: `src/lib/pendingDays.ts`, con el mismo criterio. Los días van del último `payment_date` (o la creación del vehículo) hasta hoy, con un máximo de 120.
    - **Día de entrega:** cuenta para los dos conductores. Lo debe el que **entregó** el carro: el 16-oct de UGP771 es de Juan Camilo.
  - **Orden:** los días se resuelven desde el más antiguo y sin saltos. La mora se cuenta desde el último `payment_date`, así que resolver un día posterior dejaría fuera de la mora días anteriores sin resolver.
  - **Endpoints** (`src/routes/reports.ts`, con Basic Auth):
    - `GET /reports/plates/:plate/pending-days`: cada día con `payable`, `drivers`, `responsible` y `counts_as_mora`. Trae además la tarifa diaria y el anticipo activo.
    - `GET /reports/plates/:plate/pending-days/maintenance-check?dates=…`: validación contra TallerPro de cada día (§5.1).
    - `POST /reports/plates/:plate/resolve-days` `{ dates, reason, notes?, advance_id? }`, con `reason`:
      - `maintenance`: un pago confirmado de $0 por día, con `receipt_status = 'maintenance_day'` y la nota de §5.1. Si hay warnings, la nota es obligatoria (mín. 10 caracteres; sin ella responde 422).
      - `no_driver`: si los días tienen conductor, responde **409 `DRIVER_ASSIGNED`** con los conductores. Si no tienen, no registra nada.
      - `advance`: `payDaysWithAdvance` con esas fechas. Es el mismo flujo de `POST /payments/pay-with-advance`, que ahora también acepta `dates`.
      - `liquidation`: un pago **marcador** por día. Va `confirmed`, con `amount = 0` y todo el reparto en 0, así que no suma a ingresos ni a utilidad.
        - `receipt_status = 'liquidation_debt'` y `driver_id` = el conductor que debe el día.
        - `liquidation_debt_amount` = canon + recargo. El desglose va en `flag_details` (`canon`, `late_fee`).
        - `late_fee_amount = 0`, para no contar dos veces el recargo.
  - **Liquidación** (`src/routes/liquidations.ts`):
    - `GET /liquidations/:driverId/data` devuelve `pendingRentDebt` y `pendingRentDebtDetails`: los marcadores del conductor con `liquidation_id` vacío. El modal los agrega como deducción "DÍAS EN MORA (N)".
    - Al guardar (`POST /liquidations` con `liquidation_debt_ids`), esos marcadores reciben el `liquidation_id` y quedan saldados. Si se quita la línea de la liquidación, siguen pendientes.
    - Con una liquidación ya cerrada, el modal muestra la deuda aparte.
  - **UI:** `web/src/components/ResolveDaysModal.tsx`. Se abre desde Reportes y queda sobre el menú lateral; en celular ocupa toda la pantalla. Al tocar un día se seleccionan todos desde el más antiguo hasta ese día.
- **Deshacer último pago:** `DELETE /payments/last/:plate` (revierte también el estado de la cuota de anticipo asociada).
- **Tarifa diaria** (`resolveDailyRentRate`): `drivers_vw.default_amount` → cuota pendiente de leasing → último pago → contrato pendiente → $70.000 por defecto.

## 7. Pendientes de desarrollo (brechas entre la regla y el código)

- **Saldo de recargos por pago tardío (§3):** cada pago registra su recargo causado y lo abonado, pero no hay un saldo acumulado por placa (`late_fee_amount - late_fee_paid`) ni se muestra en mora. Tampoco se pueden abonar recargos de días anteriores con un pago posterior, y los días que nunca se registran no generan fila con recargo.

- **Asignación retroactiva de cuota en conciliación:** Si un pago entró sin `installment_number` pero el conductor pagó el monto completo de canon + anticipo, permitir en la pantalla de aprobación asignar la cuota pendiente antes de confirmar.
