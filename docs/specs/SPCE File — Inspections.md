# Especificación Técnica: Sistema de Inspecciones y Auditoría

**Fecha:** 07-Feb-2026
**Autor:** AllAtYou Renting Hub
**Estado:** Implementado ✅

---

## 1. Resumen Ejecutivo
Este módulo gestiona el ciclo de vida de la revisión de activos.
1.  **Captura (Mobile):** Auditoría visual detallada en momentos clave (Entrega, Recepción, General) para generar evidencia inmutable.
2.  **Gestión (Admin):** Interfaz para visualizar, auditar y corregir registros mediante un sistema de trazas (Logs) que garantiza la integridad de los datos ante ediciones posteriores.

---

## 2. Alcance Funcional

### 2.1 Captura en Campo
* Formulario móvil optimizado con acceso a cámara nativa.
* Carga de evidencia fotográfica obligatoria según el protocolo.

### 2.2 Dashboard Administrativo
* **Listado Maestro:** Visualización tabular cronológica.
* **Visor de Detalle:** Renderizado de fotos con etiquetas legibles ("Llanta Delantera" vs `tires_front`).

### 2.3 Edición y Auditoría (NUEVO)
* **Corrección:** Permite editar observaciones y tipo de inspección en caso de error humano.
* **Logs de Cambios:** Cada edición requiere una justificación obligatoria y se registra en una tabla histórica inmutable (`inspection_logs`).

---

## 3. Modelo de Datos (Base de Datos)

### 3.1 Tabla Principal: `public.inspections`
Almacena el estado actual "vivo" de la inspección.

| Columna | Tipo | Descripción | Restricciones |
| :--- | :--- | :--- | :--- |
| `id` | `bigint` | Identificador único | PK, Auto-incremental |
| `vehicle_plate` | `text` | Placa del vehículo | FK -> `vehicles(plate)` |
| `driver_id` | `bigint` | Conductor responsable | FK -> `drivers(id)`, Nullable |
| `created_at` | `timestamptz` | Fecha de la revisión | Default `now()` |
| `type` | `text` | Motivo | `entrega`, `recepcion`, `general` |
| `photos` | `jsonb` | URLs de las imágenes | Estructura JSON (Ver 3.3) |
| `comments` | `text` | Reporte escrito | Nullable |
| `inspector_name`| `text` | Quien realizó la revisión | Nullable |

### 3.2 Tabla de Auditoría: `public.inspection_logs` (NUEVO)
Almacena el historial de cambios para trazabilidad.

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `bigint` | PK |
| `inspection_id` | `bigint` | FK -> `inspections(id)` |
| `actor_name` | `text` | Quién realizó el cambio (Admin) |
| `change_summary` | `text` | Justificación del cambio (Obligatorio) |
| `created_at` | `timestamptz` | Fecha del cambio |

### 3.3 Estructura del Objeto JSON (`photos`)
Pares clave-valor donde la clave es la posición técnica y el valor la URL pública.

```json
{
  "front": "https://supabase.../front.jpg",
  "back": "https://supabase.../back.jpg",
  "left": "https://supabase.../left.jpg",
  "right": "https://supabase.../right.jpg",
  "engine": "https://supabase.../engine.jpg",
  "interior_dash": "https://supabase.../int_dash.jpg",
  "interior_front": "https://supabase.../int_front.jpg",
  "interior_back": "https://supabase.../int_back.jpg",
  "tires_front_left": "https://supabase.../tfl.jpg",
  "tires_front_right": "https://supabase.../tfr.jpg",
  "tires_back_left": "https://supabase.../tbl.jpg",
  "tires_back_right": "https://supabase.../tbr.jpg"
}