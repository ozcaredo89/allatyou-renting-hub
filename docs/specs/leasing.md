# Spec — Leasing / Rent-to-Own

**Estado:** Vigente · **Última revisión:** 2026-10-23
**Código principal:** `src/lib/leasingCascade.ts`, `src/lib/contractGenerator.ts`, `src/templates/contrato.html`, `src/routes/leasing.ts`, `web/src/pages/AdminAmortization.tsx`
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
                 │         ├──→ default (incumplimiento)
                 │         └──→ cancelled (cancel-active, archiva y libera el vehículo)
                 ├──→ cancelled (cancel-pending, libera el vehículo)
                 └──→ superseded (se generó otro pending para la misma placa)
```

1. **Simulación** (`/leasing/simulations` desde `AdminAmortization.tsx`): solo guarda inputs, no cronograma.
2. **Generar contrato y documento** (`POST /leasing/contracts/generate` en `src/routes/leasing.ts` → `generateContract` en `src/lib/contractGenerator.ts`): crea el contrato en `pending`, genera el documento PDF+DOCX y pasa el vehículo a `reserved`. Cualquier `pending` previo de la misma placa queda `superseded`.
   - **Plantilla (fuente única de verdad):** `src/templates/contrato.html` (incluye el Contrato de Compraventa con Retención de Dominio, el Pagaré a la Orden + Carta de Instrucciones y el Anexo 1 con la tabla de amortización). Nota: `docs/plantilla_contrato_completa.docx` es solo referencia histórica y **no** la usa el código.
   - **Cómo se crea el documento (`src/lib/contractGenerator.ts`):**
     1. Valida tasas (`validateRatesVsIBC`): ni la tasa remuneratoria ni `mora_pct` pueden superar **1,5 × IBC** vigente (`config_financials`). Sin IBC configurado no se generan contratos.
     2. Obtiene consecutivos atómicos vía RPCs Postgres: `next_contract_number` (`AY-YYYY-XXXX`) y `next_pagare_number` (`PAG-YYYY-XXXX`).
     3. Calcula la tabla de amortización completa con `generateLeasingSchedule` y arma las filas HTML (`buildAmortizacionRows`).
     4. Reemplaza los placeholders `{{...}}` en `src/templates/contrato.html` (usa `src/lib/numberToWords.ts` para formatear montos y cifras en letras).
     5. Renderiza el **PDF** con Puppeteer (formato A4) y el **DOCX** con `html-to-docx`.
     6. Sube ambos archivos a Cloudflare R2 bajo `contracts/${numero_contrato}_${ts}.pdf` y `.docx` (keys inmutables) y devuelve URLs prefirmadas con **TTL de 30 minutos**.
     7. Registra la versión en `leasing_contract_versions` con el hash SHA-256 del template (`template_version`) y `audit_payload` sin PII (nunca guarda cédula, email, teléfono ni geocerca ahí).
   - Requiere `driver_id`, `daily_capital_interest` y `mora_pct`.
3. **Activar** (`PATCH /leasing/contracts/:id/activate`, modal `LeasingActivationModal` en `AdminAmortization.tsx`): exige
   - URL del contrato firmado/autenticado alojada en R2 (subida vía `POST /uploads` a la carpeta `contracts` y validada contra `R2_PUBLIC_URL`),
   - confirmación explícita de `start_date` (`start_date_confirmed: true`),
   - calendario de días pagables no vacío (si `start_date` cambió respecto al borrador, recalcula Pico y Placa).
   Genera el cronograma y activa todo en una sola RPC (`activate_leasing_contract`), pasando el contrato a `active` y el vehículo a `leasing`.
4. **Default / ejecutar pagaré**: bloqueado si pasaron **>72h** desde la creación sin documento firmado adjunto.
5. `POST /leasing/contracts` es **legacy/deprecated**: no usarlo en flujos nuevos.
6. **Cancelar un leasing en curso** (`POST /leasing/contracts/:id/cancel-active`, solo desde `active`): transición `active → cancelled` (decisión 2026-10-20). Botón en `AdminVehicles` (estado `leasing`) y en `AdminAmortization` (pestaña activos), con confirmación visual **sin montos**. Efectos:
   - El contrato pasa a `cancelled` y queda **archivado**: no se borra cronograma, pagos ni distribuciones. Sale de `leasing_contracts_summary_vw` (solo lista `active`).
   - El conductor pasa a `inactive` y se llena `terminated_at` (igual que la liquidación). Se cierra su `vehicle_assignments` (`end_date`).
   - El vehículo vuelve a `active` (disponible), sin conductor (`current_driver_id = null`, `owner_name = 'SIN CONDUCTOR ASIGNADO'`).
   - No liquida fondo de mantenimiento ni depósitos del conductor: eso sigue siendo el flujo de liquidación (`liquidations.ts`).
   - No es atómico (mismo patrón que `cancel-pending`): si falla el paso de conductor/asignación/vehículo, el contrato ya quedó `cancelled` y el error solo se registra en log.
   - La fecha real de cancelación se guarda en `leasing_contracts.cancelled_at` (migración `20261020_leasing_cancelled_at.sql`; `updated_at` no sirve porque un trigger lo mueve en cualquier UPDATE). Los contratos cancelados antes de esa migración, y los cancelados con `cancel-pending`, tienen `cancelled_at = NULL`.
   - **Un contrato `cancelled` está archivado:** `PATCH /leasing/contracts/:id` responde 409 `CONTRACT_CANCELLED` (no se edita ni se reactiva).
   - **Cancelación simultánea / estado cambiado:** si el contrato ya no está `active`, `cancel-active` responde 409 según el estado real: `ALREADY_CANCELLED` (incluye `cancelled_at`), `NOT_ACTIVE` (ej. pasó a `closed` o `default`) o `STATE_CHANGED` (no se pudo releer). El front trata estos códigos como definitivos: muestra el aviso (con la hora, si existe), oculta "Confirmar cancelación" y refresca la lista.

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

## 9. Causales de resolución y blindaje contractual (`src/templates/contrato.html`)

Además de la mora de **≥ 2 cuotas consecutivas** y la salida de la **geocerca** o exceso reiterado de velocidad, el contrato contempla (revisión 2026-10-23):

1. **Prohibición de consumo, porte de sustancias y alcohol (Cláusula Sexta):**
   - **Prohibición objetiva y definición legal:** se definen *"sustancias psicoactivas"* como las controladas en la Ley 30 de 1986 y listas del Fondo Nacional de Estupefacientes. Cero excepciones para el **cannabis (incluido el medicinal)** y para conducir bajo el efecto de cualquier sustancia o medicamento que afecte las capacidades psicomotoras. Se permite portar medicamentos recetados distintos del cannabis en empaque original sellado y con fórmula vigente. Prohibido consumir licor, llevar envases abiertos o conducir con cualquier grado de alcohol (**incluido "Grado Cero"**, Ley 1696 de 2013, confirmado con **segunda medición a los 15 minutos** según Res. 1844/2015 de Medicina Legal). Frente a pasajeros: obligación de *"no permitir a sabiendas"*, suspender el servicio y avisar a la policía.
   - **Declaración juramentada y extinción de dominio:** declaración al firmar de no consumir sustancias controladas sin prescripción médica, ni cannabis bajo ninguna modalidad (incluida la medicinal), ni tener tratamientos que afecten la conducción (falsedad = **dolo**, art. 1515 C.C.). Obligación de avisar en **24h** cualquier incautación, comparendo o inmovilización (Ley 1708 de 2014 y Ley 30 de 1986).
   - **Dos niveles de actuación (en ambos: suspensión inmediata + entrega del vehículo + 2 días hábiles de descargos antes de la resolución formal):**
     - *Nivel 1 (Hechos objetivos):* comparendo/inmovilización/informe de autoridad **específicamente por embriaguez, negativa a la prueba o sustancias psicoactivas**, prueba positiva confirmada, negativa o inasistencia a prueba (ante autoridad o laboratorio designado), o hallazgo físico documentado.
     - *Nivel 2 (Reporte/"soplo" o indicios):* notificación escrita, **suspensión preventiva de la operación**, orden de prueba obligatoria y **2 días hábiles** para descargos. Si se niega o no asiste a tiempo, o si sale positivo, las partes pactan que se presume configurado el incumplimiento grave **salvo prueba en contrario aportada en los descargos**, y la resolución se decide al vencer los 2 días hábiles de descargos.
   - **Régimen de pruebas (ingreso, aleatorias en franja de servicio y por requerimiento):** las pruebas aleatorias solo se exigen **mientras el vehículo esté en operación o dentro de la franja horaria de servicio (6:00 a.m. – 10:00 p.m.)**. Se practican **ante la autoridad de tránsito o en el laboratorio designado por el vendedor**: plazo máximo de **3 horas** para alcohol y **12 horas** para sustancias psicoactivas (orina, sangre, cabello hasta 90 días, o marcadores EtG/PEth) en IPS/laboratorio habilitado en el REPS (Res. 3100/2019) o acreditado ONAC (ISO 15189/17025) con cadena de custodia, y con autorización de entrega directa de resultados **durante la vigencia del contrato y mientras subsistan obligaciones**. Costo de laboratorio a cargo del comprador; **si sale negativo, se abona a la siguiente cuota diaria**.
   - **Anexo 2 (`Acta de Entrega Voluntaria del Vehículo`):** unificado con `docs/formatos/acta_entrega_voluntaria.html` (casillas de hechos incluyendo aliento/olor, negativa a prueba y comparendo; reconocimiento y versión de puño y letra; aceptación de prueba ante autoridad o laboratorio; detalle de llaves/documentos y retiro de objetos personales; 2 días hábiles de descargos; recibo de copia; huella y firma de **2 testigos**).
2. **Separación entre Fondo de Mantenimiento y Cláusula Penal (Cláusula Séptima):**
   - Del **fondo de mantenimiento / depósito** solo se descuentan **gastos reales y directos con factura/soporte** (limpieza, descontaminación, grúa, patios, peritajes, comparendos —sin descontar pruebas ya pagadas por el comprador—), entregando liquidación escrita.
   - Los perjuicios estimados (lucro cesante, afectación jurídica) se cobran vía **cláusula penal** (exigible ejecutivamente cuando el incumplimiento conste reconocido en el Anexo 2 o documento del deudor, art. 422 C.G.P., o vía declarativa) e indemnización adicional (**art. 1600 C.C.**, pena + indemnización acumulables sin cobrar dos veces el mismo concepto).
3. **Restitución, inspecciones y datos sensibles sin audio (Cláusula Novena):**
   - **Restitución y Pago Directo (9.1):** entrega voluntaria en **24 horas** (notificada la suspensión preventiva o la resolución); **una vez declarada la resolución o configurado el incumplimiento**, procede el **pacto expreso de Pago Directo y aprehensión por Ley 1676 de 2013 (art. 60)** con autorización de inscripción en el Registro de Garantías Mobiliarias de Confecámaras (nunca retoma por la fuerza).
   - **Cuotas pagadas en caso de resolución (9.1):** no se devuelven; se entienden causadas como contraprestación por uso y goce, depreciación y administración. Solo se liquida y devuelve el fondo de mantenimiento (7.1).
   - **Datos sensibles y videovigilancia sin audio (9.4):** autorización expresa (arts. 5 y 6 Ley 1581 de 2012) para pruebas toxicológicas, cámaras de cabina/exterior **únicamente en video (sin grabación de audio, art. 192 C.P.)** y telemetría. Aviso visible de videovigilancia que identifica a ALLATYOU S.A.S. como Responsable, la finalidad y dónde consultar la política de datos (SIC).
   - **Inspecciones sin previo aviso (9.5):** recaen exclusivamente sobre el vehículo (cabina y baúl), **sin requisa de personas ni de sus objetos personales**, en presencia del conductor y/o de **2 testigos**, con registro fotográfico/fílmico.

## 10. Preguntas abiertas

- ¿Qué hacer con los excedentes acumulados cuando se defina la política (abono a capital, a anticipo, devolución)?
