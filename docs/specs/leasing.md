# Spec — Leasing / Rent-to-Own

**Estado:** Vigente · **Última revisión:** 2026-10-12
**Código principal:** `src/lib/leasingCascade.ts`, `src/routes/leasing.ts`, `web/src/pages/AdminAmortization.tsx`
**Migraciones:** `20260714_leasing_schema.sql` → `20261009_leasing_maintenance_debits.sql`

> Este archivo describe **reglas de negocio**. El esquema exacto vive en las migraciones; no se duplica aquí.

---

## 1. Concepto

El conductor adquiere el vehículo pagando una **cuota diaria** durante la vigencia del contrato. Al terminar de pagar el capital, el vehículo queda en propiedad del conductor.

Cuota diaria típica: **$91.000** =
| Rubro | Valor típico | Columna en `leasing_schedule` | Notas |
|---|---|---|---|
| Fondo de mantenimiento | $10.000 | `maintenance_expected` | Ahorro del conductor para mantenimientos (ver `gastos-fondo-mantenimiento.md`) |
| Admin (seguro 5k + administración 6k) | $11.000 | `admin_expected` | Ambos van juntos en un solo rubro |
| Capital + interés | ~$70.000 | `interest_expected` + `principal_expected` | Cuota fija (`daily_capital_interest`); la parte de interés baja a medida que baja el saldo |

Los valores reales salen del contrato (`daily_maintenance`, `daily_admin`, `daily_capital_interest`); los de la tabla son los de referencia.

## 2. Ciclo de vida del contrato

```
simulación → pending → active → closed (solo manual, ver §7)
                 │         └──→ default (incumplimiento)
                 ├──→ cancelled (cancel-pending, libera el vehículo)
                 └──→ superseded (se generó otro pending para la misma placa)
```

1. **Simulación** (`/leasing/simulations`): solo guarda inputs, no cronograma.
2. **Generar contrato** (`POST /leasing/contracts/generate`): crea el contrato en `pending`, genera PDF+DOCX y pasa el vehículo a `reserved`. Cualquier `pending` previo de la misma placa queda `superseded`.
   - La tasa remuneratoria no puede superar **1,5 × IBC** vigente (`config_financials`). Sin IBC configurado no se generan contratos.
   - Requiere `driver_id`, `daily_capital_interest` y `mora_pct`.
3. **Activar** (`PATCH /leasing/contracts/:id/activate`): exige
   - URL del contrato firmado/autenticado alojada en R2 (`R2_PUBLIC_URL`),
   - confirmación explícita de `start_date` (`start_date_confirmed: true`),
   - calendario de días pagables no vacío.
   Genera el cronograma y activa todo en una sola RPC (`activate_leasing_contract`).
4. **Default / ejecutar pagaré**: bloqueado si pasaron **>72h** desde la creación sin documento firmado adjunto.
5. `POST /leasing/contracts` es **legacy/deprecated**: no usarlo en flujos nuevos.

`start_date_pending_confirmation = true` ⇒ el contrato existe pero **ningún pago se aplica** al cronograma hasta confirmarlo.

## 3. Cronograma (`leasing_schedule`)

- **Una cuota = un día pagable.** Solo se generan cuotas para días pagables (excluye Pico y Placa / días no-pay, calculados con `getAmortizationDates`, ciudad Cali).
- En los días no pagables el interés diario **se capitaliza** en el saldo (se cobra en las cuotas siguientes).
- Tasa diaria = `monthly_rate_pct × 12 / 365 / 100`.
- `balance_expected` = saldo de capital después de pagar esa cuota. Es la fuente de verdad para "capital pendiente".
- Generador: `generateLeasingSchedule` (mismo algoritmo que el simulador del frontend; si se cambia uno, cambiar el otro).

## 4. Aplicación de pagos (cascada)

Reglas confirmadas por el negocio (2026-10-02/03):

1. **`payments.payment_date` = día de cuota que se paga**, no el día en que llegó el dinero. Si el conductor está en mora, la UI asigna el pago al día pendiente más antiguo.
2. Por lo tanto los pagos entran en orden y **nunca se saltan cuotas**. En el flujo normal, "cuota pendiente más antigua" y "cuota con `due_date = payment_date`" son la misma.
3. El pago se aplica **solo** a la cuota con `due_date = payment_date` (o a un `targetScheduleId` explícito enviado desde conciliación manual). **Nunca** se busca automáticamente "la siguiente pendiente".
4. Prelación dentro de la cuota: **Mantenimiento → Admin → Interés → Capital**.
5. Solo se aplican pagos con `status = 'confirmed'`. Los `pending` se aplican al aprobarse (ver `pagos.md` §5).
6. Escritura atómica vía RPC `match_leasing_payment` (inserta `payment_distributions` y actualiza la cuota).

### Excepciones → alerta + conciliación manual (NO se resuelven solas)

| Situación | `issue_code` en `payment_inconsistencies` | ¿Se aplica? |
|---|---|---|
| No hay cuota con esa fecha | `LEASING_DATE_MISMATCH` | No |
| La cuota ya estaba pagada | `LEASING_INSTALLMENT_ALREADY_PAID` | No |
| Otro pago confirmado misma placa+fecha | `LEASING_DUPLICATE_PAYMENT` | No |
| Monto < cuota (tolerancia $1) | `LEASING_AMOUNT_MISMATCH` | No |
| Monto > cuota | `LEASING_EXCESS_PAYMENT` | **Sí**: la cuota se cubre y el sobrante solo se etiqueta |

- **Sobrantes y anticipos operativos (decisión 2026-10-12):**
  - Si un vehículo en leasing tiene un anticipo operativo activo y el pago ingresa con `installment_number`:
    1. Se deduce previamente la cuota del anticipo (`payments.credit_installment_amount = cuota_anticipo`).
    2. El monto enviado a la cascada de leasing es `monto_pago - credit_installment_amount`, cubriendo exactamente la cuota contractual sin generar falso excedente.
    3. La cuota del anticipo se amortiza en `operational_advance_schedule`, sincronizando `current_installment` y cerrando el anticipo si culmina.
  - Si no hay cuota de anticipo asociada y el monto supera la cuota contractual, el sobrante se etiqueta como `LEASING_EXCESS_PAYMENT`.
- **Pago de $1:** marcador de "vehículo en mantenimiento ese día". No es prueba, no se borra y no se cruza con la cuota.
- Antes de corregir un monto que no cuadra, **revisar el comprobante**: puede ser error de digitación.
- Para vehículos de leasing con anticipo, `credit_installment_amount` guarda la amortización del anticipo; los rubros de leasing (mtto, capital, interés, admin) se almacenan en `payment_distributions`.

Conciliación manual: `GET /leasing/unreconciled`, `PATCH /leasing/schedule/:id/match-payment`, `DELETE /leasing/schedule/:id/match/:paymentId` (pantalla `AdminAmortization`, pestaña "unreconciled").

## 5. Resumen del contrato (`leasing_contracts_summary_vw`)

Vista agregada (solo contratos `active`). **Al recrearla, conservar estas fórmulas:**

- `remaining_capital` = `balance_expected` de la **última cuota pagada** (por `installment_no`), o `financed_capital` si no hay ninguna. ❌ No usar `financed_capital − SUM(principal_paid)` (regresión ya ocurrida el 2026-10-09).
- `maintenance_fund_accumulated` = `SUM(maintenance_paid)`.
- `maintenance_fund_spent` = `SUM(leasing_maintenance_debits.amount_deducted)`.
- `maintenance_fund_available` = acumulado − gastado.
- Permisos: solo `service_role` (REVOKE a `anon`/`authenticated`).

El backend debe leer de esta vista y no recalcular en JS (evita truncamiento de filas de Supabase).

## 6. Casos conocidos

- **FRM099:** +$22k sobre la cuota hasta 2026-09-09, sin anticipo activo → etiquetado como excedente.
- **JHW889:** +$5k desde 2026-09-25 (anticipo #93). Un pago de $90k tenía comprobante de $91k (error de digitación).

## 7. Cierre del contrato (decisión 2026-10-12)

- El contrato **nunca se cierra automáticamente**. El paso a `closed` es **manual**.
- Cuando todas las cuotas están pagadas, el sistema debe **marcar el contrato como "cuotas completadas"** (indicador visible en la UI), pero sin cambiar el `status`.
- `maybeCloseContract` (`leasingCascade.ts`) cierra el contrato y pasa el vehículo a `active` automáticamente: **contradice esta regla y no se debe usar**. Hoy no se llama en ningún lado.
- **Pendiente de desarrollo:** flujo de cierre manual que exija subir los documentos de cierre: **paz y salvo** y **documentos de entrega del vehículo**. Ese flujo será el único que pase el contrato a `closed`.
- **Pendiente de desarrollo:** el indicador de "cuotas completadas" (puede salir de `pending_installments = 0` en la vista de resumen).

## 8. Mora (`mora_pct`)

- `mora_pct` es la **tasa de interés de mora mensual** que se imprime como **cláusula del contrato** (`{{tasa_mora}}` en `src/templates/contrato.html`): respalda legalmente el cobro de mora sobre el saldo insoluto si el conductor incumple.
- Por ley no puede superar **1,5 × IBC** (tope de usura); se valida al generar el contrato.
- **El sistema no la cobra:** hoy no se calcula ningún monto adicional por mora sobre cuotas vencidas. Si algún día se cobra, se define aquí primero.

## 9. Preguntas abiertas

- ¿Qué hacer con los excedentes acumulados cuando se defina la política (abono a capital, a anticipo, devolución)?
