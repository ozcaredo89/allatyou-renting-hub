# Especificación Técnica: Marketplace P2P (Modelo Turo)

**Fecha:** 26-Oct-2026 · **Última revisión:** 10-Nov-2026 (ticket #38, captación única)
**Autor:** AllAtYou Renting Hub
**Módulo:** Captación y Renta Comercial
**Estado:** Implementado ✅

---

## 1. Resumen Ejecutivo
Desde el **ticket #38 (10-Nov-2026)** la captación de vehículos de terceros es **única**: un solo formulario, una sola tabla (`vehicle_applications`) y una sola bandeja admin. El catálogo público `/rent` se alimenta de esa misma tabla.

Reglas de negocio definidas por el dueño del producto (10-Nov-2026):
1. **Alquilar = administración AllAtYou.** No existe alquiler P2P tipo Turo: si el dueño quiere alquilar, AllAtYou administra el carro y lo renta a conductores. En el catálogo, la renta siempre se contacta por el WhatsApp de AllAtYou.
2. **Se mantiene la venta.** El dueño puede publicar su carro para venta; el comprador contacta directamente al dueño.
3. **Modalidades (`listing_type`):** `rent` (administración), `sale` (venta), `both` (administración mientras aparece comprador).
4. **Una sola bandeja admin:** `/recruitment?tab=vehicles` (menú "Vehículos postulados"). `/marketplace` redirige allí.

Ciclo: **Captación** -> **Revisión (Admin aprueba/rechaza)** -> **Publicación opcional en catálogo** -> **Contacto por WhatsApp**.

---

## 2. Alcance Funcional

### 2.1 Captación (Público)
* **Formulario único:** `VehicleApplicationForm.tsx`, montado en la Landing (`/#propietarios`, `landing_views/TabIncome.tsx`) y en `/rent-your-car` (`RentYourCar.tsx`, solo envoltorio). Envía a `POST /vehicle-applications`.
* **Pasos:** 1. Propietario · 2. Vehículo (placa, marca, línea, año, color, combustible, transmisión) · 3. Negocio · 4. Fotos y estado (SOAT, tecno, kilometraje, todo riesgo).
* **Paso 3 — ¿Qué quieres hacer con tu carro?:**
  * `rent` / `both`: precio diario esperado (mín. $20.000) y disponibilidad.
  * `sale` / `both`: precio de venta (mín. $1.000.000) y **casilla obligatoria** autorizando mostrar nombre y WhatsApp en el catálogo (Ley 1581 Habeas Data, `accepts_public_contact`).
  * Siempre: cuándo podemos ver el vehículo (`appointment_date`).
* **Catálogo Guiado de Marcas y Líneas:** `constants/vehicleCatalog.ts` + `VehicleModelCombobox.tsx`.

### 2.2 Revisión y publicación (Administrativo)
* **Bandeja única:** `/recruitment?tab=vehicles` (`AdminRecruitment.tsx`). Muestra badge de modalidad (Administración / Venta / Admin + Venta) y badge "En catálogo".
* **Estados (`status`):** `pending` (inicial) · `approved` · `rejected` (motivo obligatorio).
* **Publicación (`published_in_catalog`):** solo un vehículo `approved` puede publicarse (botón "Publicar en catálogo" / "Retirar del catálogo"). Si pasa a `rejected` o `pending`, se despublica automáticamente. Una venta (`sale`/`both`) sin `accepts_public_contact` no se puede publicar (`422`).

### 2.3 Catálogo (Público - Demanda)
* **Vitrina Digital:** Página `/rent`. Muestra vehículos `approved` **y** `published_in_catalog = true`.
* **Filtros:** `Todos`, `En Alquiler 🔑` (`rent`/`both`) y `En Venta 🏷️` (`sale`/`both`), más buscador.
* **Fotos:** portada = foto marcada `is_cover_worthy` por la IA, o la primera `exterior`, o la primera disponible; interior = primera `interior` distinta de la portada.
* **Contacto por WhatsApp:**
  * **Venta:** "Contactar al Vendedor" va al `owner_phone` del dueño (solo se expone si `accepts_public_contact`).
  * **Alquiler:** "Reservar Renta" va siempre al WhatsApp de AllAtYou. El contacto del dueño **no** se expone en alquileres.

---

## 3. Arquitectura de Datos

### Tabla: `vehicle_applications` (fuente única)
Columnas añadidas en `2026111004_unify_vehicle_intake.sql`:
* `listing_type`: `rent` | `sale` | `both` (default `rent`, con check).
* `sale_price`: Numeric (COP), solo `sale`/`both`.
* `transmission`: `Mecánica` | `Automática`.
* `accepts_public_contact`: Boolean (autorización Habeas Data para venta).
* `published_in_catalog`: Boolean (default `false`).
* `legacy_marketplace_car_id`: id de origen de los carros migrados.
* `expected_daily_rent`, `availability_type`, `appointment_date`, `color` pasan a ser opcionales (no aplican a venta o a registros migrados).
* El email (`owner_email`) y la placa (`plate`) **nunca** se exponen en el catálogo.

### Tabla: `marketplace_cars` (retirada)
Se conserva solo como histórico. La migración copió sus registros a `vehicle_applications` (por placa, idempotente): `approved`/`rented` → `approved` y publicado si estaba `approved`; `accepts_public_contact = true` porque el formulario antiguo exigía esa autorización (ticket #6).

---

## 4. API & Endpoints

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/vehicle-applications` | Público | Captación única (anti-spam, validaciones por modalidad). |
| `GET` | `/vehicle-applications` | Privado (`basicAuth`) | Bandeja admin. |
| `PATCH` | `/vehicle-applications/:id` | Privado (`basicAuth`) | Cambia `status` (+ `status_reason`) y/o `published_in_catalog`. |
| `GET` | `/marketplace/catalog` | Público | Vitrina: `approved` + publicados, desde `vehicle_applications`. Mantiene el contrato histórico (`model`, `year`, `price_per_day`, `photo_exterior_url`...). |
| `POST` | `/marketplace/upload` | — | **Retirado** (`410 Gone`). |

---

## 5. Seguridad y Reglas de Negocio
1. **Validación de Leads:** El sistema no publica automáticamente. Requiere intervención humana (Admin) para filtrar fraudes o vehículos en mal estado.
2. **Protección Anti-Spam y Validaciones de Entrada (`POST /vehicle-applications`):**
    * **Honeypot (`website`):** Campo oculto en el formulario; si recibe contenido, el backend rechaza la solicitud con `400`.
    * **Detector Anti-Basura (`isGibberishText`):** Rechaza palabras de más de 25 caracteres, secuencias de 6 o más consonantes seguidas, o alternancia caótica de mayúsculas/minúsculas en palabras de 10 o más letras.
    * **Placa Colombiana:** Formato estricto `^[A-Z]{3}\d{3}$` (3 letras y 3 números) y verificación anti-duplicados (`409 Conflict` con CTA a WhatsApp de soporte).
    * **Celular Colombiano:** Normalización automática del prefijo `+57` cuando supera los 10 dígitos y validación de formato `^3\d{9}$`.
    * **Año del Vehículo:** Rango permitido desde `1990` hasta `año actual + 1`.
3. **Autenticación Administrativa (`basicAuth`):** `GET` y `PATCH /vehicle-applications` usan `basicAuth` dentro del router.
4. **Protección de Datos:** La placa (`plate`) se captura para antecedentes pero **nunca** se muestra en el catálogo público por seguridad.
5. **Integridad:** Las fotos se almacenan en R2 bajo la carpeta `vehicles` y se referencian en la tabla correspondiente.

---

## 6. Lecciones Aprendidas y Casos Borde Reales (Oct-2026)

### 6.1 El dilema de los dos flujos de vehículos (Landing vs Marketplace) — resuelto en #38
* **Estado actual:** unificados (ver §1). Lo siguiente se conserva como contexto histórico.
* **Confusión recurrente:** Existen dos flujos distintos para registrar vehículos:
    1. **Landing Page (`#propietarios`):** Usa `VehicleApplicationForm.tsx` → `POST /vehicle-applications` → tabla `vehicle_applications` → Administración en `/recruitment` (pestaña "Vehículos"). Modelo: el propietario cede la administración de su carro a la flota.
    2. **Marketplace (`/rent-your-car`):** Usa `RentYourCar.tsx` → `POST /marketplace/upload` → tabla `marketplace_cars` → Moderación en `/marketplace`. Modelo: el propietario alquila directamente estilo Turo.
* **Por qué se llenaba de basura el Marketplace:** El enlace `/rent-your-car` está en el header de `PublicLayout.tsx` con clase `hidden md:flex`. Los usuarios en móvil no lo veían, pero los bots de internet seguían el enlace y atacaban el endpoint abierto `POST /marketplace/upload`.

### 6.2 Defensa anti-spam sin falsos positivos para usuarios reales
* **Regla de mayúsculas/minúsculas (CamelCase caótico):** Si se aplica alternancia de mayúsculas/minúsculas en palabras cortas, se bloquean nombres y apellidos legítimos como `McDonald`, `DiCaprio`, `LeBlanc` o `JuanCarlos`. **Regla:** Solo evaluar transiciones en palabras de 10 caracteres o más (`word.length >= 10`), exigiendo al menos 3 transiciones.
* **Tono del mensaje de validación:** Nunca usar mensajes acusatorios como *"ingresa un nombre real"*. Usar tono neutro: *"Revisa el nombre, parece tener un error de escritura"*.
* **Placa estricta colombiana:** Forzar mayúsculas y validar `^[A-Z]{3}\d{3}$`. Los bots genéricos generan cadenas aleatorias de 15 a 25 caracteres (ej. `BTFMGQCUVAGFQUBRRPIIODOF`) que quedan neutralizadas de inmediato.

### 6.3 Pegado de celulares con prefijo internacional (`+57`)
* Si se normaliza con `.replace(/\D/g, "").slice(0, 10)`, el pegado de `+57 300 123 4567` (12 dígitos) genera `5730012345`, almacenando un número falso que parece válido pero deja incomunicado al lead.
* **Regla:** Solo retirar el prefijo `57` cuando la longitud sea mayor a 10 dígitos:
  ```ts
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("57")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
  ```
* **HTML `maxLength`:** El input no debe tener `maxLength={10}` estricto en el DOM, ya que el navegador recorta antes del evento `onChange`. Debe configurarse en `maxLength={18}` para permitir el pegado de números formateados con prefijo y espacios.

### 6.4 Visibilidad de errores en móvil (formularios largos)
* Si el estado `error` se renderiza al principio del formulario y el usuario presiona "Enviar" al final de una página con scroll, no ve el error y asume que el botón no funciona.
* **Regla:** Siempre ejecutar `scrollIntoView({ behavior: "smooth", block: "center" })` sobre el banner de error y/o mostrar el mensaje de error duplicado junto al botón de acción.

### 6.5 Carpeta de subida de fotos y compresión en cliente
* **Compresión en cliente (`compressImage.ts`):** Las fotos tomadas con cámaras de celular (5MB-15MB) se redimensionan a máx `1600px` y se comprimen en canvas a JPEG con `quality: 0.8` en el navegador del usuario antes de subirse. Esto reduce el peso en >95% (~150KB-300KB), protegiendo la cuota de Cloudflare R2 y acelerando la subida en conexiones móviles.
* Al invocar `${API}/uploads`, siempre debe incluirse `fd.append("folder", "vehicles")`. Si se omite, el backend asigna por defecto `folder = "proofs"`, lo que activa el OCR concurrente de comprobantes de pago sobre fotos de vehículos, saturando el servidor innecesariamente.
* **Validación de origen:** No aceptar URLs `https://` arbitrarias; validar que pertenezcan a `process.env.R2_PUBLIC_URL` para evitar inyección de enlaces o rastreadores externos.

### 6.6 Subida flexible de fotos sin fricción y auto-clasificación con IA
* **Problema:** Forzar al usuario a subir fotos de ángulos específicos (exterior estricto, interior estricto) genera fricción durante el registro inicial y deserciones en móviles si el usuario solo tiene fotos generales en su galería.
* **Solución UX:** 
  1. Guía visual con recomendaciones claras y amigables (☀️ Buena luz natural, 🚗 Carro completo ángulo 3/4, 💺 Interior o tablero limpio).
  2. Subida flexible de fotos múltiples o captura con cámara sin forzar ranuras rígidas.
* **Procesamiento con IA (`vehicleImageClassifier.ts`):**
  1. En el backend, las imágenes se procesan en segundo plano (`setImmediate`) usando modelos de visión (Gemini 2.5 Flash / GPT-4o-mini).
  2. La IA clasifica si es un vehículo (`is_vehicle`), su ángulo/parte (`kind`: exterior, interior, detalle), su etiqueta detallada (`frente`, `lateral`, `tres_cuartos`, `tablero`, etc.) y evalúa cuál foto califica como mejor foto de portada (`is_cover_worthy`).
  3. No bloquea la respuesta HTTP del usuario; la UI confirma la postulación de inmediato y los tags se persisten asíncronamente en Supabase.
