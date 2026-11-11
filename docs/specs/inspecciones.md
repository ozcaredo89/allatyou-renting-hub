# Especificación Técnica: Sistema de Inspecciones y Auditoría

**Fecha:** 07-Nov-2026  
**Ticket:** #12, #28  
**Autor:** AllAtYou Renting Hub  
**Estado:** Implementado ✅  

---

## 1. Resumen Ejecutivo
Este módulo gestiona el ciclo de vida de la revisión física y técnica de activos de la flota.
1. **Captura Móvil Optimizada:** Diseñada para realizarse a pie de vehículo desde un celular, con registro de odómetro (kilometraje), indicador visual de nivel de combustible (vacío, 1/4, 1/2, 3/4, full) y compresión automática de fotografías en el navegador antes de subir al bucket Cloudflare R2 / Supabase Storage.
2. **Distribución Instantánea por WhatsApp:** Al completar o consultar la inspección, se genera un mensaje preformateado con enlace a un visor público ligero para enviar inmediatamente al conductor o cliente.
3. **Gestión y Auditoría (Admin):** Interfaz para visualizar odómetro, combustible y fotos, con capacidad de corrección controlada respaldada por logs inmutables (`inspection_logs`).

---

## 2. Alcance Funcional

### 2.1 Captura en Campo (Mobile-First)
* **Odómetro (Kilometraje):** Input ergonómico numérico (`inputMode="numeric"`) con vista previa con separador de miles y recordatorio del último kilometraje registrado en flota. Sincroniza automáticamente en `vehicle_mileage_logs`.
* **Nivel de Gasolina Visual:** Barra segmentada interactiva y botones táctiles grandes para los 5 niveles estándar (`empty`, `1/4`, `1/2`, `3/4`, `full`).
* **Compresión Client-Side:** Todas las fotos (tomadas con cámara nativa o cargadas desde la galería) se comprimen automáticamente en el navegador mediante HTML5 Canvas (redimensionamiento a máx 1400px y calidad JPEG 75%), reduciendo el peso de ~5-15MB a <250KB por imagen para evitar saturar memoria y bucket.
* **Compartir por WhatsApp:** Generación instantánea de acta de entrega/recepción con link directo al reporte.

### 2.1.1 Borradores compartibles, cronómetro y prueba de ruta (#28)
* **Guardar avance:** el formulario permite `Guardar avance y pasar a otra persona` en cualquier punto, sin exigir fotos. La inspección queda con `status = 'draft'` y se genera un `continue_token` (UUID).
* **Continuar por enlace:** el enlace `/inspection/continue/:token` (público, sin Basic Auth, disponible en `web` y `www`) abre el mismo formulario con todo lo capturado. La placa queda fija.
* **Reglas de negocio:**
  * El enlace de continuación **no vence**.
  * Los borradores **no se borran**: quedan abiertos indefinidamente y se destacan en `/inspections` (aviso "pendientes de completar y cerrar", badge *Abierta*, filtro *Solo abiertas*).
  * Se puede **pasar en cadena** (A → B → C …) con el mismo enlace, cuantas veces haga falta.
  * Cada guardado exige el nombre de quien lo hace y deja un registro en `inspection_logs`; `inspector_name` queda con el nombre del último que guardó (quien finaliza). Mientras no existan usuarios en la app es texto libre (ver backlog #29).
* **Finalizar:** aplica las validaciones normales (mín. 1 foto y prueba de ruta respondida), pasa a `status = 'completed'`, fija `completed_at` y `duration_seconds` y sincroniza el km en `vehicle_mileage_logs` (solo al finalizar). Una vez finalizada, el enlace ya no permite editar (responde 409) y muestra el acceso al reporte.
* **Cronómetro:** el formulario muestra en vivo cuánto lleva la revisión desde `started_at` (momento en que se abrió el formulario por primera vez). La duración guardada es el **tiempo total de inicio a cierre**, incluyendo pausas entre personas.
* **Prueba de ruta (`road_test`):** sí/no — indica que se subieron al carro y lo anduvieron para probarlo y escucharlo. Obligatoria para finalizar.
* **Endpoints:** `POST /inspections` con `status: 'draft'` (admin) crea el borrador; `GET` / `PUT /public/inspections/continue/:token` cargan y guardan avance (`finalize: true` para cerrar).

### 2.2 Reporte Público de Inspección
* Ruta pública de visualización (`/inspection/:id` y `/inspections/view/:id`) que permite al conductor, cliente o taller revisar el reporte y fotos en alta resolución con visor fullscreen sin necesidad de credenciales administrativas.
* Endpoint API público: `GET /public/inspections/:id`.

### 2.3 Dashboard Administrativo
* **Listado Maestro:** Visualización tabular cronológica con columnas para Fecha, Vehículo, Conductor, Tipo, Kilometraje, Combustible e Inspector.
* **Visor de Detalle y Edición:** Muestra métricas de odómetro y combustible, galería de fotos con zoom (`ImageViewer`), logs de auditoría y botón de compartir WhatsApp.

---

## 3. Modelo de Datos (Base de Datos)

### 3.1 Tabla Principal: `public.inspections`
Almacena el estado actual de la inspección.

| Columna | Tipo | Descripción | Restricciones |
| :--- | :--- | :--- | :--- |
| `id` | `bigint` | Identificador único | PK, Auto-incremental |
| `vehicle_plate` | `text` | Placa del vehículo | FK -> `vehicles(plate)` |
| `driver_id` | `bigint` | Conductor responsable | FK -> `drivers(id)`, Nullable |
| `created_at` | `timestamptz` | Fecha de la revisión | Default `now()` |
| `type` | `text` | Motivo | `entrega`, `recepcion`, `general` |
| `mileage` | `numeric` | Kilometraje / Odómetro en km | Nullable |
| `fuel_level` | `text` | Nivel de gasolina | `'empty'`, `'1/4'`, `'1/2'`, `'3/4'`, `'full'` |
| `photos` | `jsonb` | URLs de las imágenes comprimidas | Estructura JSON (Ver 3.3) |
| `comments` | `text` | Reporte escrito / Observaciones | Nullable |
| `inspector_name`| `text` | Quien realizó la revisión (último que guardó) | Nullable |
| `status` | `text` | Estado | `draft`, `completed` (default `completed`) |
| `continue_token` | `uuid` | Token del enlace de continuación de borradores | Único, Nullable |
| `started_at` | `timestamptz` | Inicio de la revisión | Nullable |
| `completed_at` | `timestamptz` | Cierre de la revisión | Nullable |
| `duration_seconds` | `integer` | Duración total inicio → cierre | Nullable |
| `road_test` | `boolean` | Incluye prueba de ruta | Nullable |

### 3.2 Tabla de Auditoría: `public.inspection_logs`
Almacena el historial de cambios para trazabilidad.

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `bigint` | PK |
| `inspection_id` | `bigint` | FK -> `inspections(id)` |
| `actor_name` | `text` | Quién realizó el cambio (Admin o persona que guardó avance/finalizó) |
| `change_summary` | `text` | Justificación obligatoria |
| `created_at` | `timestamptz` | Fecha del cambio |

### 3.3 Estructura del Objeto JSON (`photos`)
```json
{
  "front": "https://pub-...r2.dev/inspections/front_17310000.jpg",
  "back": "https://pub-...r2.dev/inspections/back_17310000.jpg",
  "left": "https://pub-...r2.dev/inspections/left_17310000.jpg",
  "right": "https://pub-...r2.dev/inspections/right_17310000.jpg",
  "engine": "https://pub-...r2.dev/inspections/engine_17310000.jpg",
  "interior_dash": "https://pub-...r2.dev/inspections/interior_dash_17310000.jpg",
  "interior_front": "https://pub-...r2.dev/inspections/interior_front_17310000.jpg",
  "interior_back": "https://pub-...r2.dev/inspections/interior_back_17310000.jpg",
  "tires_front_left": "https://pub-...r2.dev/inspections/tires_front_left_17310000.jpg",
  "tires_front_right": "https://pub-...r2.dev/inspections/tires_front_right_17310000.jpg",
  "tires_back_left": "https://pub-...r2.dev/inspections/tires_back_left_17310000.jpg",
  "tires_back_right": "https://pub-...r2.dev/inspections/tires_back_right_17310000.jpg"
}
```
