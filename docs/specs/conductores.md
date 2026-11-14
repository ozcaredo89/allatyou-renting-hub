# Especificación Técnica: Directorio de Conductores

**Fecha:** 06-Feb-2026
**Autor:** AllAtYou Renting Hub
**Estado:** Implementado ✅

---

## 1. Resumen Ejecutivo
El módulo de "Directorio de Conductores" permite la gestión integral del personal operativo (conductores). Funciona como un expediente digital centralizado (Hoja de Vida, Documentos Legales, Licencias) y permite controlar el estado operativo (Activo, Inactivo, Suspendido) de cada conductor.

Recientemente se incorporó la capacidad de capturar **Fotos de Perfil (Selfies)** directamente desde el dispositivo utilizando la cámara frontal.

---

## 2. Modelo de Datos (Base de Datos)

**Tabla:** `public.drivers`

| Columna | Tipo | Descripción | Restricciones |
| :--- | :--- | :--- | :--- |
| `id` | `bigint` | Identificador único | PK, Auto-incremental |
| `full_name` | `text` | Nombre completo | Not Null, Uppercase |
| `document_number` | `text` | Cédula o ID | Unique, Not Null |
| `phone` | `text` | Teléfono de contacto | Not Null |
| `email` | `text` | Correo electrónico | Nullable |
| `address` | `text` | Dirección de residencia | Nullable |
| `status` | `text` | Estado operativo | `active`, `inactive`, `suspended` |
| `photo_url` | `text` | URL de la Foto de Perfil | Nullable (Nuevo) |
| `created_at` | `timestamptz` | Fecha de registro | Default `now()` |
| `updated_at` | `timestamptz` | Última modificación | Nullable |

### Campos de Documentación (URLs a Storage)
Los siguientes campos almacenan URLs públicas a los archivos PDF/Imágenes en el bucket de Supabase:
* `cv_url`: Hoja de Vida.
* `id_front_url`: Cédula (Frente).
* `id_back_url`: Cédula (Atrás).
* `license_front_url`: Licencia de Conducción (Frente).
* `license_back_url`: Licencia de Conducción (Atrás).
* `contract_url`: Contrato firmado.

---

## 3. API Backend (`/drivers`)

### 3.1 Listar Conductores
* **Método:** `GET`
* **Query Params:**
    * `?all=true`: Retorna todos los conductores (histórico).
    * *(Vacío)*: Retorna solo conductores con `status = 'active'`.
* **Placa asignada (`assigned_plate`):** La respuesta incluye `assigned_plate` (`string | null`) con la placa del vehículo que tiene `current_driver_id` apuntando al conductor (priorizando vehículos activos/en operación sobre `sold`/`inactive`). En `/drivers` (`AdminDrivers.tsx`), la tabla muestra la placa como enlace directo a `/vehicles?plate=<PLACA>`, donde `/vehicles` filtra por esa placa y abre automáticamente la ficha del vehículo.

### 3.2 Crear / Editar Conductor
* **Método:** `POST` (Crear) / `PUT /:id` (Actualizar)
* **Body (JSON):**
    ```json
    {
      "full_name": "PEPITO PEREZ",
      "document_number": "123456789",
      "phone": "3001234567",
      "status": "active",
      "photo_url": "https://supabase.../profile_123.jpg", // Foto Perfil
      "cv_url": "https://supabase.../cv.pdf",
      // ... otros documentos
    }
    ```

---

## 4. Frontend & UX (Captura de Perfil)

### Patrón de Interacción: "Action Sheet"
Para la foto de perfil, se implementó un menú de selección inferior para mejorar la experiencia móvil.

1.  **Avatar Interactivo:** El usuario toca el círculo de la foto (o el placeholder con las iniciales).
2.  **Menú de Opciones:** Se despliega un panel inferior con dos opciones claras:
    * 📷 **Usar Cámara:** Abre el modo "Selfie".
    * 🖼️ **Subir Archivo:** Abre la galería del dispositivo.

### Modo Cámara (WebRTC - Selfie)
Se utiliza la API `navigator.mediaDevices.getUserMedia` con configuraciones específicas para retratos:

* **Cámara Frontal:** Se fuerza el uso de la cámara frontal con `{ video: { facingMode: "user" } }`.
* **Efecto Espejo (Mirror):**
    * Para que la experiencia sea natural, el video y la captura se invierten horizontalmente.
    * **Técnica:** Se aplica una transformación CSS `transform: scaleX(-1)` al elemento `<video>` y una transformación equivalente en el `<canvas>` al momento de capturar la imagen (`context.scale(-1, 1)`).
* **Flujo:**
    1.  Abrir Modal.
    2.  Visualizar Video (Espejo).
    3.  Capturar -> Generar Blob JPG -> Subir a `/uploads`.
    4.  Cerrar Modal y actualizar vista previa.

---

## 5. Reglas de Negocio
1.  **Unicidad:** No pueden existir dos conductores con el mismo `document_number`. El backend retorna error `409 Conflict`.
2.  **Archivos:** Los documentos se suben primero al endpoint genérico `/uploads`, y la URL resultante se guarda en la tabla `drivers`.
3.  **Promoción:** Existe un flujo separado (`POST /promote/:id`) para convertir un aspirante (`driver_applications`) en conductor oficial, copiando sus datos básicos.


---

## 6. Retiro de Conductor, Liquidación, Paz y Salvo y Devolución de Garantía (Regla 20 días SIMIT)

**Código principal:** `src/routes/liquidations.ts`, `src/lib/pazSalvoGenerator.ts`, `src/templates/paz-salvo.html`, `src/lib/fleetReminders.ts`, `web/src/components/LiquidationModal.tsx`, `web/src/pages/AdminDrivers.tsx`

### 6.1 Flujo de Retiro y Liquidación
1. Cuando un conductor se retira y entrega el vehículo, se registra su liquidación en `liquidations` (`POST /liquidations`).
2. El conductor pasa a estado `inactive` con fecha `terminated_at`, se cierra su asignación activa en `vehicle_assignments` y el vehículo queda sin conductor asignado.
3. Se consolidan los **saldos a favor** (depósito inicial + ahorro acumulado) y los **descuentos** (gasolina, lavado, entregas pendientes, préstamos, comparendos, reparaciones, días en mora).

### 6.2 Plazo de 20 Días Calendario para Validación en SIMIT (`payment_due_date`)
1. **Regla de negocio (Decisión 2026-11-10 — Issue #23):** A partir de la fecha de entrega material del vehículo (`liquidation_date`), AllAtYou Renting S.A.S. cuenta con **veinte (20) días calendario** para validar en el sistema **SIMIT** (y organismos de tránsito) posibles comparendos, fotomultas o infracciones ocurridas durante el período de tenencia del vehículo antes de desembolsar el saldo final de la liquidación.
2. Por defecto, al crear una liquidación se calcula `payment_due_date = liquidation_date + 20 días calendario`.
3. **Reflejo en el Documento Oficial de Paz y Salvo (`src/templates/paz-salvo.html`):**
   - La **Cláusula Cuarta (Devolución de la Garantía y Plazo de Validación en SIMIT)** deja constancia expresa del término de **veinte (20) días calendario** posteriores a la entrega del vehículo para la validación de multas en el SIMIT.
   - El campo `fecha_devolucion` del acta se inicializa por defecto en `liquidation_date + 20 días calendario` (editable por el administrador al generar el documento).

### 6.3 Notificación por Correo 3 Días Antes del Vencimiento del Pago
1. El job diario de recordatorios de flota (`src/lib/fleetReminders.ts`, ejecutado por `POST /reminders/run` en la ventana de la mañana) verifica todas las liquidaciones pendientes de pago (`payment_proof_url IS NULL` y `paid_at IS NULL`).
2. Cuando faltan **3 días o menos** para `payment_due_date` (es decir, desde el día 17 posterior al retiro, o si ya se encuentra vencida), se incluye la alerta en el correo enviado a `FLEET_REMINDER_EMAILS` para que administración valide el SIMIT, genere el Paz y Salvo definitivo y realice el pago.
3. La alerta se repite cada día (también si el saldo final es ≤ 0) hasta que la liquidación quede **marcada como pagada** (`paid_at` con valor). Desde ese momento deja de generar alertas.
4. **Cómo se marca como pagada (Decisión 2026-11-10 — Issue #31):**
   - **Saldo a devolver (`final_balance > 0`):** solo subiendo el comprobante de pago (`payment_proof_url` obligatorio).
   - **Saldo ≤ 0** (el conductor debe o queda en cero, no hay transferencia): botón **"Marcar como saldada"**, sin comprobante (queda en `audit_log` como `MARK_SETTLED`). Opcionalmente se puede adjuntar soporte.
5. **Liquidaciones históricas:** las que vencían antes del 2026-11-10 (anteriores a este control) se marcaron como pagadas en la migración `2026111003`, con nota "Histórica: pagada antes del control de pagos".
6. **Fechas en hora Colombia:** retiro, vencimiento y fecha de pago se calculan con la fecha de America/Bogota (no UTC). Las fechas elegidas en pantalla se guardan al mediodía de Colombia para que no cambien de día.
7. **Fuente única:** los datos de pago viven solo en las columnas `payment_due_date`, `payment_proof_url`, `paid_at`, `payment_notes` de `liquidations` (no en `document_metadata`).

### 6.4 Calendario de Retiros y Soportes de Cierre (Paz y Salvo + Comprobante de Pago)
1. En `/drivers` (`AdminDrivers.tsx`), el administrador cuenta con una vista de **Calendario de Retiros y Liquidaciones** (accesible también con `?view=calendar`).
2. El calendario muestra en cada día:
   - Qué conductor se retiró en esa fecha (`liquidation_date` / `terminated_at`).
   - Qué día vence el pago de su liquidación tras los 20 días de validación SIMIT (`payment_due_date`).
3. Al hacer clic en el registro del día se abre el detalle de la liquidación con acceso directo a:
   - **Documento de Paz y Salvo** (descarga del PDF oficial / Word `.docx` en R2 o generación del acta).
   - **Comprobante de Pago** (`payment_proof_url`, `paid_at`, `payment_notes`): carga y visualización del soporte de transferencia o pago en efectivo.
