# Spec — Recordatorios de vencimientos (SOAT, Tecnomecánica, GPS, aceite, inspecciones, Pico y Placa, Liquidaciones)

**Estado:** Vigente · **Última revisión:** 2026-11-12
**Código principal:** `src/routes/reminders.ts`, `src/lib/fleetReminders.ts`, `.github/workflows/reminders.yml`

---

## 1. Disparo

GitHub Action `reminders.yml` llama `POST /reminders/run` (header `X-Internal-Secret`) a las 10:00, 15:00 y 23:00 UTC (5am, 10am y 6pm hora Colombia). No hay otro scheduler.

## 2. Suscripciones públicas (`reminder_subscriptions`)

- Se crean desde el landing (`POST /reminders`, sin auth), una por placa (upsert por `plate`).
- Cada suscripción guarda su propio correo/WhatsApp, horas de envío, días de anticipación y **sus propias fechas** de SOAT/Tecno (no se leen de `vehicles`).
- Como el endpoint es público, **no se usa para la flota**: cualquiera podría sobrescribir el correo de una placa.

## 3. Resumen diario de la flota y liquidaciones (Issues #15, #23 y #47)

- **Separado del landing:** la flota **no** usa `reminder_subscriptions` (es pública: cualquiera podría sobrescribir el correo de una placa). Las alertas de flota salen de las tablas internas (`vehicles`, `expenses`, `inspections`, `liquidations`) y van solo a `FLEET_REMINDER_EMAILS`. No hay suscripciones por vehículo: entran automáticamente todos los vehículos de la flota operativa.
- **Vehículos incluidos:** `status` en `active`, `maintenance` o `leasing` (mismo filtro por defecto de `/vehicles`; antes de #47 se excluían los de leasing).
- **Un solo correo al día, agrupado por vehículo** (Decisión 2026-11-12 — Issue #47). Por cada vehículo con alguna alerta se listan todas juntas, con 🔴 (vencido/urgente) o 🟡 (próximo):
  - **SOAT** que vence en **≤ 15 días** o ya vencido (🔴 si vencido/hoy).
  - **Tecnomecánica** que vence en **≤ 10 días** o ya vencida.
  - **GPS — pago de renovación** (`vehicles.gps_renewal_date`) que vence en **≤ 30 días** o ya vencido (mismo semáforo de `/vehicles`).
  - **Cambio de aceite:** último gasto con categoría `Cambio de aceite`; 🟡 si pasaron **> 90 días**, 🔴 si **> 120 días** (mismo semáforo de `/vehicles`). Vehículos sin ningún cambio de aceite registrado no se alertan.
  - **Inspección:** 🔴 si la última inspección **finalizada** tiene **≥ 15 días** o el vehículo **nunca** se ha revisado. (Entre 10 y 14 días solo se marca en amarillo en `/vehicles`, sin correo.)
  - **Liquidaciones de conductores (Issue #23):** a partir de `liquidation_date` se cuentan **20 días calendario** para validar comparendos en SIMIT (`payment_due_date`). Se avisa **3 días antes** y mientras siga sin comprobante (`payment_proof_url IS NULL` y `paid_at IS NULL`), con enlace al calendario `/drivers?view=calendar`.
- **Orden:** primero los vehículos con más alertas rojas. Si no hay nada por reportar, no se envía.
- **Frecuencia:** **una vez al día**, en la **primera corrida del cron de ese día** (hora Colombia), sin ventana horaria. El cron de GitHub Actions llega con horas de retraso (p. ej. el de 5am corría a las 12:30pm), y la ventana anterior de 5–9am hacía que el resumen nunca se enviara. El envío se reserva en la tabla `fleet_digest_runs` (una fila por día); si ningún correo sale, la fila se libera y la siguiente corrida reintenta.
- **Destinatarios:** variable de entorno `FLEET_REMINDER_EMAILS` en Railway (correos separados por coma). Sin la variable, no se envía. Los correos no se guardan en el repo (es público).
- **Disparo manual:** `POST /reminders/run?force_fleet=1` con el mismo secreto reenvía el resumen aunque ya se haya enviado hoy.
## Preguntas abiertas

- ¿Recordatorio de flota también por WhatsApp?
- ¿Días de anticipación distintos para la flota?
