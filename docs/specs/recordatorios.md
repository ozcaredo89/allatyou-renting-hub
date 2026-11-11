# Spec — Recordatorios de vencimientos (SOAT, Tecnomecánica, Pico y Placa, Liquidaciones)

**Estado:** Vigente · **Última revisión:** 2026-11-10
**Código principal:** `src/routes/reminders.ts`, `src/lib/fleetReminders.ts`, `.github/workflows/reminders.yml`

---

## 1. Disparo

GitHub Action `reminders.yml` llama `POST /reminders/run` (header `X-Internal-Secret`) a las 10:00, 15:00 y 23:00 UTC (5am, 10am y 6pm hora Colombia). No hay otro scheduler.

## 2. Suscripciones públicas (`reminder_subscriptions`)

- Se crean desde el landing (`POST /reminders`, sin auth), una por placa (upsert por `plate`).
- Cada suscripción guarda su propio correo/WhatsApp, horas de envío, días de anticipación y **sus propias fechas** de SOAT/Tecno (no se leen de `vehicles`).
- Como el endpoint es público, **no se usa para la flota**: cualquiera podría sobrescribir el correo de una placa.

## 3. Resumen diario de la flota y liquidaciones (Issue #15 & Issue #23)

- **Fuentes:**
  1. `vehicles.soat_expires_at` / `vehicles.tecno_expires_at` de vehículos con `status` `active` o `maintenance`. Son las fechas que se actualizan al registrar el gasto de renovación en `/expenses` (spec gastos §7).
  2. `liquidations` (unida con `drivers`): liquidaciones de conductores retirados pendientes de pago (`payment_proof_url IS NULL` y `paid_at IS NULL`). Se alertan también las de saldo ≤ 0, hasta que se marquen como saldadas (spec conductores §6.3).
- **Qué incluye:**
  - SOAT que vence en **≤ 15 días**; Tecnomecánica en **≤ 10 días** (mismos defaults que las suscripciones públicas), más vigencias **ya vencidas** mientras el vehículo siga activo.
  - **Liquidaciones de conductores (Decisión 2026-11-10 — Issue #23):** A partir de la fecha de retiro/entrega del vehículo (`liquidation_date`), se cuentan **20 días calendario** para validar comparendos en SIMIT (`payment_due_date = liquidation_date + 20 días`). El sistema avisa por correo **3 días antes** de `payment_due_date` (cuando faltan ≤ 3 días o si ya está vencida y sigue sin comprobante de pago).
- **Formato:** correo enviado en la corrida de la mañana con las alertas de flota (SOAT/Tecno) y las liquidaciones próximas a cumplir los 20 días de validación SIMIT (con enlace directo al calendario de retiros `/drivers?view=calendar`). Si no hay nada por reportar, no se envía.
- **Frecuencia:** una vez al día, en la corrida de la mañana (ventana 5–9am hora Colombia, tolera retrasos del cron).
- **Destinatarios:** variable de entorno `FLEET_REMINDER_EMAILS` en Railway (correos separados por coma). Sin la variable, no se envía. Los correos no se guardan en el repo (es público).
- **Disparo manual:** `POST /reminders/run?force_fleet=1` con el mismo secreto envía el resumen sin importar la hora.

## Preguntas abiertas

- ¿Recordatorio de flota también por WhatsApp?
- ¿Días de anticipación distintos para la flota?
