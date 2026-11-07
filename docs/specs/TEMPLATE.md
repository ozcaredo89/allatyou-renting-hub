# [ID o Nombre de la Funcionalidad] — Título

- **Ticket / Issue:** #
- **Estado:** borrador | listo | en desarrollo | completado
- **Tamaño:** S (≤ 1 h) | M (≤ ½ día) | L (dividir en fases)
- **Módulos involucrados:** API (`src/`), Web (`web/`), DB (`supabase/migrations/`)

---

## 1. Problema u Objetivo de Negocio
Explicación concisa (1–3 frases): qué necesidad operativa o de negocio se resuelve y por qué.

## 2. Alcance (Scope)
- Lista de funcionalidades y cambios específicos a implementar.

## 3. Fuera de Alcance (Out of scope)
- Qué cosas NO se deben tocar para evitar sobreingeniería o sesiones interminables de IA.

## 4. Criterios de Aceptación
- [ ] Comportamiento observable 1
- [ ] Comportamiento observable 2
- [ ] Comportamiento observable 3

## 5. Notas de Diseño Técnico
- **Base de Datos:** Migración necesaria en `supabase/migrations/` (si aplica).
- **Backend (API):** Nuevas rutas en `src/routes/` o servicios en `src/lib/`.
- **Frontend (Web):** Páginas o componentes en `web/src/components/`.
- **Archivos tocados:** Lista de archivos esperados para evitar cambios colaterales.

## 6. Plan de Pruebas Manuales / Verificación
- Pasos concretos para probar en localhost (API en `:3000` o `:3002`, Web en `:5174`).
