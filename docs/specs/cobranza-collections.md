# Especificación Técnica: Módulo de Gestión de Cobranza (CRM)

**Fecha:** Enero 2026  
**Versión:** 1.0  
**Contexto:** AllAtYou Renting Hub

## 1. Resumen Ejecutivo
Este módulo permite la gestión semi-automatizada de la cartera diaria. Su objetivo es notificar vía WhatsApp a los conductores que presentan mora en el pago de su cuota diaria, registrando quién envió el mensaje y cuándo.

El sistema está diseñado para operar bajo un modelo **Multi-Empresa** y con roles operativos (**App Users**) separados de los conductores.

---

## 2. Arquitectura de Base de Datos

### 2.1 Nuevas Tablas

#### `app_users`
Usuarios operativos encargados de la gestión (Cobradores/Administrativos).
- **id**: PK.
- **full_name**: Nombre del operador (Ej: Mauricio).
- **document_number**: Identificación única.
- **phone**: Celular de contacto.
- **status**: 'active' | 'inactive'.

#### `reminder_templates`
Plantillas de mensajes para WhatsApp.
- **company_id**: FK a la empresa.
- **message_body**: Texto con variables dinámicas `{NOMBRE}`, `{PLACA}`, `{DIAS}`.
- **is_default**: Booleano para marcar la plantilla principal.

#### `payment_notifications`
Log histórico de mensajes enviados.
- **vehicle_plate**: FK a vehículo.
- **driver_id**: FK a conductor.
- **sent_by_user_id**: FK a `app_users` (quien dio el clic).
- **generated_date**: Fecha del cobro (YYYY-MM-DD).
- **status**: 'sent'.
- **message_snapshot**: Copia exacta del texto enviado ese día (auditoría).
- **resend_count**: Contador de reenvíos.

### 2.2 Modificaciones
- **`vehicles`**: Se agregó `company_id` para filtrar activos por empresa.

---

## 3. Lógica del Backend (API)

### 3.1 Controladores (`src/routes/collections.ts`)

#### `GET /collections/pending`
Calcula la lista de trabajo del día.
1.  **Validación Horaria:** Verifica si la hora del servidor (America/Bogota) es > **15:45**. Si es menor, retorna bloqueo (`locked: true`).
2.  **Cálculo de Mora:** Consulta la vista `vehicle_last_payment` filtrando por `is_overdue = true`.
3.  **Exclusión:** Resta los conductores que ya tienen registro en `payment_notifications` con fecha de hoy.
4.  **Resolución de Contacto:**
    * Prioridad 1: Teléfono en tabla `drivers`.
    * Prioridad 2: Teléfono en tabla `vehicles` (`owner_whatsapp`).

#### `POST /collections/send`
Registra el envío de un mensaje.
- Inserta en `payment_notifications`.
- Estado inicial: `resend_count = 0`.

#### `GET /collections/history`
Lista los mensajes enviados en la fecha actual (`generated_date = TODAY`).

#### `POST /collections/resend/:id`
Incrementa el contador `resend_count` de un registro específico.

### 3.2 Controladores Auxiliares
- **`POST /app-users`**: Creación rápida de operarios desde el Frontend.
- **`PATCH /drivers/:id/contact`**: Actualización atómica del teléfono del conductor sin editar todo el perfil.

---

## 4. Frontend (Interfaz de Usuario)

### Página: `AdminCollections.tsx`

#### 4.1 Header y Filtros
- **Selector de Empresa:** Carga las empresas y selecciona la primera por defecto. Filtra las peticiones al backend.
- **Selector de Usuario (Operador):** Obligatorio para habilitar los botones de envío.
- **Botón [+] Usuario:** Abre un modal (`CreateUserModal`) para registrar nuevos cobradores en caliente.

#### 4.2 Pestaña "Pendientes"
- Muestra tabla con: Placa, Conductor, Días de Mora.
- **Validación de Teléfono:**
    - Si falta: Muestra botón "Agregar" -> Abre `PhoneEditModal`.
    - Si existe: Muestra botón "WhatsApp".
- **Acción de Envío:**
    1.  Genera el link de WhatsApp (`wa.me`) con el mensaje parseado.
    2.  Abre nueva pestaña.
    3.  Llama a la API `/send` para registrar el evento y quitar el item de la lista.

#### 4.3 Pestaña "Historial"
- Muestra lo gestionado en el día.
- **Botón Ver/Reenviar:**
    - Muestra alerta con el mensaje original (`message_snapshot`).
    - Incrementa el contador de reenvío en BD.

---

## 5. Reglas de Negocio Clave

1.  **Un envío al día:** Un conductor desaparece de la lista de "Pendientes" apenas se le envía el primer mensaje del día.
2.  **Horario Restringido:** El módulo está diseñado para usarse al cierre de la operación bancaria (3:45 PM), aunque permite "forzar" la vista mediante query param `?force=true` (solo backend).
3.  **Persistencia de Plantilla:** El mensaje no está "quemado" en código, se lee de la BD (`reminder_templates`) permitiendo cambios sin redeploy.

---

## 6. Scripts de Inicialización (Seed)

Para desplegar en un ambiente nuevo:

```sql
-- Usuario Inicial
INSERT INTO public.app_users (full_name, document_number, phone) 
VALUES ('Mauricio', '123456789', '+573238035356');

-- Plantilla Base
INSERT INTO public.reminder_templates (company_id, message_body, is_default)
VALUES (1, 'SEÑOR {NOMBRE} PRESENTA {DIAS} DIAS EN MORA. SU VEHICULO {PLACA} PODRIA SER DESCONECTADO A LAS 4PM...', true);