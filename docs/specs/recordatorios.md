# Spec — Recordatorios de vencimientos (SOAT, Tecnomecánica, Pico y Placa)

**Estado:** Vigente · **Última revisión:** 2026-11-07
**Código principal:** `src/routes/reminders.ts`, `src/lib/fleetReminders.ts`, `.github/workflows/reminders.yml`

---

## 1. Disparo

GitHub Action `reminders.yml` llama `POST /reminders/run` (header `X-Internal-Secret`) a las 10:00, 15:00 y 23:00 UTC (5am, 10am y 6pm hora Colombia). No hay otro scheduler.

## 2. Suscripciones públicas (`reminder_subscriptions`)

- Se crean desde el landing (`POST /reminders`, sin auth), una por placa (upsert por `plate`).
- Cada suscripción guarda su propio correo/WhatsApp, horas de envío, días de anticipación y **sus propias fechas** de SOAT/Tecno (no se leen de `vehicles`).
- Como el endpoint es público, **no se usa para la flota**: cualquiera podría sobrescribir el correo de una placa.

## 3. Resumen diario de la flota (Decisión 2026-11-07 — Issue #15)

- **Fuente:** `vehicles.soat_expires_at` / `vehicles.tecno_expires_at` de vehículos con `status` `active` o `maintenance`. Son las fechas que se actualizan al registrar el gasto de renovación en `/expenses` (spec gastos §7).
- **Qué incluye:**
  - SOAT que vence en **≤ 15 días**; Tecnomecánica en **≤ 10 días** (mismos defaults que las suscripciones públicas).
  - Vigencias **ya vencidas**, mientras el vehículo siga activo (para que no se olviden).
- **Formato:** un solo correo con todas las placas, separado en "Vencidos" y "Próximos a vencer". Si no hay nada por reportar, no se envía.
- **Frecuencia:** una vez al día, en la corrida de la mañana (ventana 5–9am hora Colombia, tolera retrasos del cron).
- **Destinatarios:** variable de entorno `FLEET_REMINDER_EMAILS` en Railway (correos separados por coma). Sin la variable, no se envía. Los correos no se guardan en el repo (es público).
- **Disparo manual:** `POST /reminders/run?force_fleet=1` con el mismo secreto envía el resumen sin importar la hora.

## Preguntas abiertas

- ¿Recordatorio de flota también por WhatsApp?
- ¿Días de anticipación distintos para la flota?
