# Spec — Gastos y Fondo de Mantenimiento (Notas Débito)

**Estado:** Vigente · **Última revisión:** 2026-11-07
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
- En el panel de utilidades se muestra como **Fondo Mant. (Hoy)**: siempre el saldo actual, no el del periodo consultado (ver `utilidades.md` §5).

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
| `advance` | Se crea un **anticipo operativo** por el excedente, con N cuotas diarias (por defecto 10) y tasa por defecto 15%, con las mismas reglas de tasa/cuota de `anticipos.md` §2.1 (decisión 2026-10-21; antes era 0% fijo). |
| `none` | No hubo excedente. |

### Garantías de consistencia

- La validación "ya existe un anticipo activo para esta placa" se hace **antes** de guardar el gasto → si falla, no se escribe nada (evita gastos duplicados al reintentar).
- Si falla la creación del anticipo, de su cronograma o de la nota débito (habiendo anticipo), se **revierte todo**: gasto, vehículos, adjuntos, log, alertas y anticipo.
- Si falla solo la nota débito sin anticipo, el gasto queda guardado y la API responde **207** con `debit_note_error` para que la UI avise.

### Comprobante

Numeración `ND-00001` (id con padding). PDF generado en el navegador (`debitNotePdf.ts`) con datos del vehículo, conductor, gasto, movimiento del fondo, excedente y firmas. Se descarga desde Expenses (fila del gasto o modal de éxito) y desde el drawer de leasing en AdminVehicles (pestaña "Notas Débito").

## 4. Edición, reasignación y borrado de gastos

### 4.1. Estado actual de la Edición (UI y API)
- El modal de edición en `web/src/pages/Expenses.tsx` y el endpoint `PUT /expenses/:id` solo permiten modificar: **fecha, categoría, ítem, monto, descripción** y **agregar nuevos soportes**.
- ⚠️ **Limitación:** **No es posible cambiar ni reasignar vehículos/placas desde la aplicación.** Las placas se guardan en `expense_vehicles` al crearse y el endpoint de edición no las toca.

### 4.2. Estado actual del Borrado
- No existe botón de eliminar ni endpoint `DELETE /expenses/:id` en la API (solo rollback interno si la creación transaccional falla).
- **Regla de negocio definida (decisión 2026-10-12):** al borrar un gasto que tiene nota débito de leasing, el descuento al fondo **debe revertirse** (el fondo vuelve a tener disponible ese valor).
- ⚠️ **Pendiente de desarrollo:** hoy si se borrase por BD, la nota quedaría con `expense_id = NULL` (`ON DELETE SET NULL`) y el descuento seguiría vigente sin advertencia.

### 4.3. Procedimiento Operativo (SOP) ante error de asignación de vehículo
Cuando un usuario reporta: *"Creé un gasto para el carro X y era para el Y"*:

1. **Paso 1: Identificar placas completas** (usar `flota-referencia.md` si el usuario solo dio los 3 dígitos, ej. "132" → `JKR132`, "228" → `UGN228`).
2. **Paso 2: Verificar afectación de Leasing**:
   - Consultar `leasing_maintenance_debits` para el `expense_id`.
   - **Caso A (Sin débito de leasing):**
     - Actualizar `expense_vehicles` (`plate = NUEVA_PLACA`).
     - Si hay alerta en `expense_alerts`, actualizar `vehicle_plate = NUEVA_PLACA`.
     - Insertar en `expense_audit_log` con acción `plate_reassigned` detallando placas anterior/nueva y motivo.
   - **Caso B (Con débito de leasing):**
     - Requiere anular la nota débito vieja (reintegrar saldo al fondo del contrato anterior), y si el nuevo vehículo también tiene leasing activo con fondo disponible, generar la nota débito correspondiente sobre el contrato del nuevo vehículo. Si hubo anticipo operativo (`operational_advances`), verificar si tiene cuotas pagadas antes de revertir.

### 4.4. Especificación técnica para la solución definitiva (Feature en App)
Para que el usuario pueda resolverlo directamente en la aplicación:
1. **API (`PUT /expenses/:id`)**:
   - Aceptar campo opcional `plates: string[]`.
   - Si cambia la placa:
     - Validar que las placas existan en `vehicles`.
     - Si el gasto anterior tenía nota débito de leasing, bloquear con error indicando que los gastos con débito de leasing requieren anulación/reversión previa.
     - Actualizar `expense_vehicles` prorrateando el monto entre las nuevas placas.
     - Actualizar `expense_alerts` o re-evaluar reglas con `checkExpenseAuditRules`.
     - Registrar en `expense_audit_log` con `action = 'updated'` indicando el cambio de placas.
2. **Frontend (`Expenses.tsx`)**:
   - En el modal `editingExpense`, mostrar selector/input de placa(s) con autocompletado de la flota.
   - Si tiene nota débito de leasing asociada (`e.leasing_debit_note`), deshabilitar el cambio de placa y mostrar badge explicativo: *"Gasto ligado a Nota Débito de Leasing ND-XXXXX. No se puede transferir de vehículo directamente"*.

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

### Descuento del fondo de mantenimiento (leasing) desde el Taller (Decisión 2026-11-06)
**Origen:** la orden de DBC859 del 2026-11-06 (gastos 1130–1135, $310.000) entró sin `apply_to_leasing` y no generó nota débito. Se corrigió a mano llamando al RPC `create_leasing_maintenance_debit` (nota #7). La API no cambió: el descuento ya existía, pero el Taller no lo pedía.

Para que un gasto del Taller descuente el fondo, el `POST /expenses` debe cumplir esto:
- **Campos obligatorios:** `apply_to_leasing: true` y `leasing_excess_method: "cash"`. No usar `"advance"`: si la placa ya tiene un anticipo activo, o si la tasa o la cuota no son válidas, la API responde 400 y **no guarda el gasto**. Con fire-and-forget, ese gasto se perdería.
- **Una sola placa:** con varias placas, la API ignora `apply_to_leasing` y no genera nota.
- **Un solo POST por orden:** todos los ítems van en `items[]` para que salga una sola nota por el total. Si se hace un POST por ítem, sale una nota por cada ítem.
- **Contrato activo:** si la placa no tiene contrato de leasing, la API guarda el gasto sin nota y responde 201 sin avisar. El Taller puede consultar antes `GET /leasing/summary?plate=`.
- **Revisar la respuesta:**
  - `201` con `debit_note` en `null` cuando se esperaba nota quiere decir que no se descontó nada.
  - `207` quiere decir que el gasto se guardó pero la nota falló (`debit_note_error`).

  En los dos casos, el Taller debe registrar o avisar el problema, no solo dejarlo en un log.
- **No hay corrección por edición:** la nota solo se genera al crear el gasto. Editar el gasto después no la genera. La corrección se hace llamando al RPC `create_leasing_maintenance_debit` con el contrato, el gasto principal (el de menor id de la orden), la placa, el total y el método.

---

## 7. Actualización Opcional de Vigencias: SOAT y Tecnomecánica (Decisión 2026-10-29 — Issue #4)

Al registrar un gasto individual para un vehículo en `/expenses`:
- **Disparador:** Si algún ítem o categoría incluye "SOAT" o "Tecno" / "Tecnomecánica" (también "técnico-mecánica" con guion). Si el gasto trae **ambos** tipos, el modal ofrece actualizar las dos vigencias en un mismo paso; cada una se puede desmarcar (Issue #13).
- **Carácter Opcional:** Es 100% opcional; el gasto se puede guardar de inmediato omitiendo este paso.
- **SOAT:**
  1. **Fecha sugerida (+1 año):**
     - Si la vigencia actual está activa (`soat_expires_at >= fecha_gasto`), se trata de una renovación anticipada: sugiere exactamente 1 año después de la vigencia actual con el mismo día y mes.
     - Si la vigencia actual ya está vencida (`soat_expires_at < fecha_gasto`) o no existe fecha previa registrada, la nueva póliza inicia con la compra: sugiere exactamente 1 año a partir de la fecha del gasto reportado.
  2. **Carga de PDF:** Soporte para subir el PDF del SOAT. El backend procesa el archivo con Gemini OCR para extraer la fecha de vigencia (`vigencia_hasta`), el número de póliza y la placa para validación contra el vehículo. Almacena el documento en Cloudflare R2 (`vehicles.soat_url`).
     - **Validación de la fecha leída (Issue #13):** se pre-llena solo si está entre la fecha del gasto y 1 mes después de la fecha sugerida. Fuera de ese rango se advierte al usuario y se mantiene la sugerida.
     - **Placa distinta (Issue #13):** si la placa leída no coincide con la del vehículo, el usuario debe marcar una confirmación explícita antes de poder actualizar la ficha.
  3. Al confirmar, actualiza `vehicles.soat_expires_at` y `vehicles.soat_url` solo tras el guardado exitoso del gasto.
- **Tecnomecánica:**
  1. **Fecha sugerida (+1 año):** Aplica la misma regla que SOAT: +1 año de la vigencia previa si aún está activa, o +1 año de la fecha del gasto si está vencida o sin registro. *Decisión 2026-11-07 (#13):* se mantiene esta regla por ahora aunque una RTM anticipada podría no acumular vigencia; la fecha es editable y el usuario ingresa la exacta del certificado cuando difiera.
  2. **Sin documento:** No requiere ni solicita archivo adjunto.
  3. Al confirmar, actualiza `vehicles.tecno_expires_at` solo tras el guardado exitoso del gasto.
- **Fallo al guardar el gasto (Issue #13):** el modal permanece abierto mostrando el error y conserva fechas y PDF para reintentar; la ficha solo se actualiza tras el guardado exitoso.
- **Trazabilidad:** Toda actualización sobre el vehículo se realiza sincronizadamente al guardar el gasto o vía `PATCH /vehicles/:plate`.
