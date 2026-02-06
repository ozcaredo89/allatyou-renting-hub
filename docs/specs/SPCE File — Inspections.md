# Especificación Técnica: Módulo de Inspecciones (Revisión de Vehículos)

**Fecha:** 03-Feb-2026  
**Autor:** AllAtYou Renting Hub  
**Estado:** Implementado ✅

---

## 1. Resumen Ejecutivo
Este módulo permite realizar una auditoría visual del estado del vehículo en momentos clave (Entrega al conductor, Recepción, o Control General). Su objetivo es generar evidencia fotográfica inmutable para resolver disputas sobre daños, aseo o faltantes.

---

## 2. Modelo de Datos (Base de Datos)

Se utiliza una tabla relacional con capacidad semi-estructurada (JSONB) para flexibilidad en las fotos.

**Tabla:** `public.inspections`

| Columna | Tipo | Descripción | Restricciones |
| :--- | :--- | :--- | :--- |
| `id` | `bigint` | Identificador único | PK, Auto-incremental |
| `vehicle_plate` | `text` | Placa del vehículo | FK -> `vehicles(plate)` |
| `driver_id` | `bigint` | Conductor responsable en ese momento | FK -> `drivers(id)`, Nullable |
| `created_at` | `timestamptz` | Fecha y hora exacta de la revisión | Default `now()` |
| `type` | `text` | Motivo de la revisión | `entrega`, `recepcion`, `general` |
| `photos` | `jsonb` | URLs de las imágenes almacenadas | Default `'{}'` |
| `comments` | `text` | Observaciones escritas / Daños | Nullable |
| `inspector_name`| `text` | Nombre de quien realizó la revisión | Nullable |

### Estructura del Objeto JSON (`photos`)
El campo `photos` almacena pares clave-valor donde la clave es la posición y el valor es la URL pública en Supabase Storage.

```json
{
  "front": "https://supabase.../front.jpg",
  "back": "https://supabase.../back.jpg",
  "left": "https://supabase.../left.jpg",
  "right": "https://supabase.../right.jpg",
  "engine": "https://supabase.../engine.jpg",
  "interior_front": "https://supabase.../int_f.jpg",
  "tires_front": "https://supabase.../tires_f.jpg"
  // ... otras claves dinámicas
}