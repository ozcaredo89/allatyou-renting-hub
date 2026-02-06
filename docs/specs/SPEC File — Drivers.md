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