# Spec / Referencia — Flota Activa y Mapeo Rápido

**Estado:** Vigente · **Última revisión:** 2026-11-05  
**Fuente en BD:** `vehicles`, `leasing_contracts`

---

## 1. Regla de Mapeo Rápido de Vehículos por Terminación (Alias)

En las operaciones diarias y comunicaciones del equipo, es común referirse a los vehículos usando únicamente los **últimos tres dígitos de su placa** (ejemplo: *"el 132"*, *"el 228"*, *"el 859"*).

- **Invariante:** En la flota actual de AllAtYou, los últimos 3 dígitos identifican unívocamente a cada vehículo activo.
- **Acción para agentes y desarrolladores:** Cuando un usuario o requerimiento mencione un número de 3 dígitos para un vehículo, mapear directamente a la placa correspondiente usando esta tabla antes de consultar la base de datos.

---

## 2. Directorio Rápido de la Flota

| Alias (Dígitos) | Placa Completa | Modelo / Línea | Estado | Modalidad Operativa | Notas |
|:---:|:---:|---|:---:|:---:|---|
| **061** | `ICV061` | Chevrolet Spark Life 2015 | `active` | Renting propio | |
| **099** | `FRM099` | Chevrolet Spark GT 2019 | `leasing` | **Leasing activo** | Fondo mant. activo |
| **132** | `JKR132` | Chevrolet Spark Life 2017 | `active` | Renting propio | |
| **135** | `HMO135` | Chevrolet Sail 2014 | `leasing` | **Leasing activo** | Fondo mant. activo |
| **182** | `GCZ182` | Chevrolet Spark GT 2019 | `active` | Renting propio | |
| **228** | `UGN228` | Chevrolet Spark Life 2015 | `active` | Renting propio | |
| **249** | `JKR249` | Chevrolet Spark Life 2017 | `active` | Renting propio | |
| **293** | `FQY293` | Chevrolet Beat 2019 | `active` | Renting propio | |
| **311** | `IST311` | Chevrolet Spark 2016 | `sold` | Inactivo (Vendido) | |
| **383** | `IFZ383` | Chevrolet Spark Life 2016 | `active` | Renting propio | |
| **564** | `EGW564` | Chevrolet Spark Life 2016 | `active` | Renting propio | |
| **574** | `HZV574` | Chevrolet Spark Life 2015 | `active` | Renting propio | |
| **723** | `HPM723` | Kia Picanto | `sold` | Inactivo (Vendido) | |
| **771** | `UGP771` | Chevrolet Spark Life 2015 | `active` | Renting propio | |
| **859** | `DBC859` | Chevrolet Spark Life 2015 | `leasing` | **Leasing activo** | Fondo mant. activo |
| **884** | `EHW884` | Chevrolet Spark Life 2018 | `active` | Renting propio | |
| **889** | `JHW889` | Chevrolet Spark 2017 | `leasing` | **Leasing activo** | Fondo mant. activo |
| **906** | `HZU906` | Chevrolet Spark Life 2015 | `active` | Renting propio | |
| **909** | `ISS909` | Chevrolet Spark Life 2016 | `active` | Renting propio | |
| **959** | `HMO959` | Chevrolet Spark Life 2014 | `sold` | Inactivo (Vendido) | |
| **974** | `ISS974` | Chevrolet Spark Life | `active` | Renting propio | |

---

## 3. Consideraciones Rápidas por Modalidad

1. **Vehículos con Leasing Activo (`DBC859`, `FRM099`, `HMO135`, `JHW889`):**
   - Tienen fondo de mantenimiento acumulable por cuota pagada.
   - Todo gasto imputado a ellos puede tener **Nota Débito** (`leasing_maintenance_debits`) y eventualmente un **anticipo operativo** (`operational_advances`) por excedente.
   - Cualquier reasignación, edición o anulación de gasto sobre estas placas debe auditar primero si afectó el fondo o generó nota débito.

2. **Vehículos en Renting Propio (Resto de flota activa):**
   - No tienen notas débito de mantenimiento ni contratos de leasing activos.
   - Los gastos asociados impactan directamente el balance de utilidad mensual del vehículo (`utilidades.md`).
   - Las reasignaciones de gastos entre vehículos de renting propio son operaciones puramente de `expense_vehicles` y alertas.
