# Specs de negocio — AllAtYou Renting Hub

Fuente de verdad de las **reglas de negocio** de cada módulo. Las leen tanto personas como agentes de IA antes de tocar código.

## Índice

| Dominio | Archivo | Leer antes de tocar |
|---|---|---|
| Leasing / Rent-to-Own | [leasing.md](leasing.md) | `leasingCascade.ts`, `contractGenerator.ts`, `templates/contrato.html`, `routes/leasing.ts`, `AdminAmortization.tsx`, migraciones `*leasing*` |
| Pagos diarios | [pagos.md](pagos.md) | `routes/payments.ts`, aprobación en `routes/reports.ts`, `Pay.tsx`, `Reports.tsx` |
| Anticipos operativos | [anticipos.md](anticipos.md) | `routes/advances.ts`, `operational_advance*` |
| Gastos y fondo de mantenimiento | [gastos-fondo-mantenimiento.md](gastos-fondo-mantenimiento.md) | `routes/expenses.ts`, `Expenses.tsx`, notas débito |
| Utilidades y rentabilidad | [utilidades.md](utilidades.md) | `routes/profit.ts`, `AdminProfit.tsx`, vistas `vehicle_month_*` |
| Conductores | [conductores.md](conductores.md) | `routes/drivers.ts`, directorio de conductores |
| Cobranza (CRM) | [cobranza-collections.md](cobranza-collections.md) | módulo de cobranza |
| Inspecciones | [inspecciones.md](inspecciones.md), [inspecciones-dashboard.md](inspecciones-dashboard.md) | `routes/inspections.ts` |
| Marketplace | [marketplace.md](marketplace.md) | `routes/marketplace.ts` |
| Landing | [landing.md](landing.md) | sitio público |
| Arquitectura | [arquitectura.md](arquitectura.md) | visión general de repos y tecnologías |

> Los specs de conductores, cobranza, inspecciones, marketplace, landing y arquitectura son de feb-2026 y están orientados a lo técnico; revisarlos contra el código antes de confiar en ellos.

## Cómo escribir y mantener un spec

1. **Qué y por qué, no cómo.** Reglas, invariantes, decisiones con fecha y motivo, casos reales. No copiar esquemas ni código (viven en migraciones y en `src/`).
2. **Corto:** 50–150 líneas. Si crece, dividir por subdominio.
3. **Se actualiza en el mismo commit** que cambia la regla. Un cambio de regla sin spec actualizado está incompleto.
4. **Funcionalidad nueva:** primero se escribe/actualiza el spec, luego se implementa y la revisión se hace contra el spec.
5. Lo no decidido va en **"Preguntas abiertas"**; no se inventan reglas.
6. Encabezado: estado, fecha de última revisión, archivos de código principales.
