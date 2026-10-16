# Spec — Gastos y Fondo de Mantenimiento (Notas Débito)

**Estado:** Vigente · **Última revisión:** 2026-10-12
**Código principal:** `src/routes/expenses.ts`, `src/routes/leasing.ts` (debit-notes), `web/src/pages/Expenses.tsx`, `web/src/utils/debitNotePdf.ts`
**Migraciones:** `20261009_leasing_maintenance_debits.sql`

---

## 1. Gastos (`expenses`)

- Un registro de gasto puede tener **varios ítems** (`items[]`); cada ítem es una fila en `expenses`.
- Un gasto puede repartirse entre **varias placas**: `expense_vehicles.share_amount`. El reparto es exacto en centavos (`splitEven`): la suma de las partes siempre es igual al total.
- Adjuntos en `expense_attachments` con `kind`: `evidence` (foto del trabajo) o `invoice` (factura).
- Toda creación queda en `expense_audit_log`.
- `description` es NOT NULL: si no hay descripción se guarda `""`.
- `/expenses` requiere **Basic Auth** (desde 2026-10-09).

### Auditoría automática (`expense_audit_rules` → `expense_alerts`)

Corre en segundo plano después de guardar (no bloquea la respuesta):
- Si el ítem coincide con una regla y el valor supera `max_allowed_price` → `PRICE_HIGH`.
- Si se repitió el mismo ítem en la placa antes de `expected_frequency_days` → `FREQUENCY_HIGH`.
- Si el ítem no existe como regla, se **crea** automáticamente con tope = valor × 1,25 y frecuencia de 60 días.

## 2. Fondo de mantenimiento (solo vehículos en leasing)

Cada cuota de leasing aporta `maintenance_expected` (típico $10.000/día) a un fondo que pertenece al contrato.

- **Acumulado** = `SUM(leasing_schedule.maintenance_paid)`.
- **Gastado** = `SUM(leasing_maintenance_debits.amount_deducted)`.
- **Disponible** = acumulado − gastado. Nunca puede quedar negativo.
- Se consulta en `leasing_contracts_summary_vw` / `GET /leasing/summary?plate=`.

## 3. Nota Débito de mantenimiento

Cuando se registra un gasto para **una sola placa** con contrato de leasing activo, el usuario puede marcar "Descontar del Fondo de Mantenimiento". Por defecto viene marcado si la placa tiene leasing.

Cálculo (RPC `create_leasing_maintenance_debit`, con lock `FOR UPDATE` sobre el contrato para evitar dobles descuentos):
- `amount_deducted` = min(disponible, total del gasto)
- `excess_amount` = total − deducido
- Guarda `balance_before` / `balance_after` como foto contable del momento.

Si el gasto tiene varios ítems, se genera **una** nota débito por el total, ligada al primer `expense_id`.

### Excedente (el fondo no alcanza)

El usuario elige cómo se cubre:
| Método | Efecto |
|---|---|
| `cash` | El conductor paga la diferencia de contado. Solo queda registrado en la nota. |
| `advance` | Se crea un **anticipo operativo** a 0% por el excedente, con N cuotas diarias (por defecto 10) que suman exactamente el excedente (ver `anticipos.md`). |
| `none` | No hubo excedente. |

### Garantías de consistencia

- La validación "ya existe un anticipo activo para esta placa" se hace **antes** de guardar el gasto → si falla, no se escribe nada (evita gastos duplicados al reintentar).
- Si falla la creación del anticipo, de su cronograma o de la nota débito (habiendo anticipo), se **revierte todo**: gasto, vehículos, adjuntos, log, alertas y anticipo.
- Si falla solo la nota débito sin anticipo, el gasto queda guardado y la API responde **207** con `debit_note_error` para que la UI avise.

### Comprobante

Numeración `ND-00001` (id con padding). PDF generado en el navegador (`debitNotePdf.ts`) con datos del vehículo, conductor, gasto, movimiento del fondo, excedente y firmas. Se descarga desde Expenses (fila del gasto o modal de éxito) y desde el drawer de leasing en AdminVehicles (pestaña "Notas Débito").

## 4. Borrar un gasto con nota débito (decisión 2026-10-12)

- **Regla:** al borrar un gasto que tiene nota débito, el descuento al fondo **se revierte** (el fondo vuelve a tener disponible ese valor).
- **Antes de borrar**, la pantalla debe mostrar una **advertencia** con la afectación: número de nota débito, valor que vuelve al fondo y, si hubo excedente financiado con anticipo, el anticipo asociado.
- ⚠️ **Pendiente de desarrollo:** hoy la nota queda con `expense_id = NULL` (`ON DELETE SET NULL`) y el descuento **sigue vigente**. No hay advertencia en pantalla.
- Por definir al implementarlo: qué pasa con el anticipo creado por el excedente si ya tiene cuotas pagadas.

## 5. Preguntas abiertas

- ¿Se pueden descontar del fondo gastos de vehículos en renting (no leasing)? Hoy no.
- ¿Editar el valor de un gasto con nota débito debe recalcular la nota?

---

## 6. Integración con AllAtYou Taller (Sincronización Automática de Reparaciones)

**Origen:** Al dar salida a un vehículo (`estado = 'entregado'`) en la aplicación de taller (`allatyou-taller`).

### Reglas de Negocio y Validación de Flota
- **Propietario / Flota propia:** La sincronización solo aplica a los vehículos de la flota propia administrada por AllAtYou. Se valida en el taller verificando que el cliente asociado al vehículo coincida con el documento configurado (`ALLATYOU_RENTING_CLIENTE_DOC`) y el tenant del taller (`ALLATYOU_RENTING_EMPRESA_ID`).
- **Consistencia de placas:** Se validó que las placas activas de la flota en Renting coinciden al 100% con los vehículos registrados a nombre del propietario en el taller.

### Mecanismo de Integración
- **Consumo de API:** El backend de Taller consume directamente `POST /expenses` con HTTP Basic Auth (`ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS`).
- **Mapeo de Datos:**
  - `date`: Fecha de entrega o ingreso en formato `YYYY-MM-DD`.
  - `plates`: `[placa]` del vehículo.
  - `description`: Motivo de visita / diagnóstico de la orden de taller.
  - `items`: Arreglo extraído de `items_factura` de la orden de taller (filtrando montos `> 0`). Cada ítem se clasifica bajo categoría `"Mantenimiento"`.
- **Idempotencia:** La sincronización se dispara únicamente en la transición de estado hacia `entregado` (`isTransitioningToEntregado`), garantizando que ediciones posteriores no dupliquen gastos.
- **Resiliencia:** La llamada se ejecuta asíncronamente en segundo plano (fire-and-forget con logging de errores) para no bloquear la salida del vehículo en el taller si la red o API externa presenta demoras.
