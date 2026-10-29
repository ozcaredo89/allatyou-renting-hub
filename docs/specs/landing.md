# SPEC FILE: AllAtYou Landing Page & Ecosystem
**Versión:** 2.1 (Captación, Anti-Spam & Lecciones Aprendidas)  
**Estado:** Producción  
**Dominio:** www.allatyou.com  

---

## 1. Propósito y Estrategia
La Landing Page ha evolucionado de un simple folleto informativo a un Ecosistema de Servicios. Cumple tres funciones estratégicas:
1. **Conversión Core (Renting):** Captar propietarios (inversionistas) y conductores para el modelo operativo administrado.
2. **Growth Hacking (SEO & Utilidades):** Atraer tráfico masivo mediante herramientas gratuitas de alto valor (Pico y Placa, Recordatorios) ubicadas en la "Zona de Acción" del Hero.
3. **Upselling (Asistencia):** Vender el servicio de "Asistencia Vehicular" como un producto independiente o complementario.

---

## 2. Arquitectura y Enrutamiento

### 2.1 Dominios
* **`www.allatyou.com` (Público):** Landing Page, Asistencia, Utilidades, `/rent-your-car`, `/rent`.
* **`web.allatyou.com` (Operativo / ERP Admin):** Aplicación de gestión interna (redirige a `/pay` o rutas de admin).

### 2.2 Router (`web/src/App.tsx`)
El enrutamiento público se maneja bajo el `PublicLayout` (Header blanco/transparente).

| Ruta | Componente | Descripción |
| :--- | :--- | :--- |
| `/` | `Landing.tsx` | Página principal con Hero, Utilidades, Simulador y Formularios. |
| `/rent-your-car` | `RentYourCar.tsx` | Formulario de subida de vehículos al Marketplace P2P. |
| `/rent` | `RentCatalog.tsx` | Catálogo de vehículos disponibles para rentar. |
| `/assistance` | `Assistance.tsx` | Landing de venta del servicio de Asistencia ($180k/mes). |
| `/pay` | `Pay.tsx` | Pasarela de pagos para clientes operativos. |

---

## 3. Formularios de Captación y el Doble Flujo de Vehículos

> ⚠️ **Lección de Arquitectura Clave:** Existen dos flujos separados de registro de vehículos con propósitos y destinos diferentes. No confundirlos:

### 3.1 `DriverApplicationForm` (Conductores)
* Postulación de conductores que buscan trabajar un vehículo de la flota.
* Endpoint: `POST /driver-applications`.
* Captura de referencias, documentos (cédula, licencia) y firma digital en canvas.
* Administración en `web.allatyou.com/recruitment` (pestaña "Conductores").

### 3.2 `VehicleApplicationForm` (Propietarios - Renting Administrado)
* **Propósito:** El propietario entrega su vehículo a AllAtYou para que sea administrado dentro de la flota operativa.
* **Ubicación:** Sección `#propietarios` de la Landing y modal del Simulador de Ganancias (`TabIncome.tsx`).
* **Endpoint:** `POST /vehicle-applications` -> tabla `vehicle_applications`.
* **Moderación / Vista Admin:** `web.allatyou.com/recruitment` -> Pestaña **"Vehículos"** (`AdminRecruitment.tsx`).
* **Validaciones y UX:**
  * Formulario en 4 pasos con validación secuencial antes de permitir avanzar (`handleNext`).
  * **Buscador interactivo de Marca y Modelo (`VehicleModelCombobox`):** Autocomplete en tiempo real con catálogo unificado (`vehicleCatalog.ts`), soporte para modelos personalizados (ej. Honda Odyssey) sin fricción de selects rígidos ni pasos ocultos.
  * Al seleccionar marca "Otra", se solicita la marca personalizada sin ocultar el campo de línea.
  * Chips de disponibilidad rápida para agendar cita de peritaje (*"Mañana en la mañana"*, *"Esta semana"*, etc.).
  * **Fechas de SOAT y Tecnomecánica con UX asistida (`VehicleDateField`):**
    * Se inicializan por defecto asumiendo vigencia aproximada (+6 meses) para evitar campos vacíos que desorientan al usuario.
    * Apertura directa del calendario con `showPicker()` al hacer clic en el campo.
    * Chips rápidos de 1-toque: `+6 meses`, `Fin de año`, `+1 año`.
    * Semáforo de vigencia en tiempo real (`✓ Vigente` / `⚠️ Vencido`).
  * Subida flexible de fotos (cámara o galería) a la carpeta `vehicles` de Cloudflare R2 con previsualización y clasificación IA en segundo plano.
  * Auto-scroll al banner de error (`scrollIntoView`) para garantizar visibilidad en dispositivos móviles.

### 3.3 `RentYourCar` (Marketplace P2P - Alquiler Directo)
* **Propósito:** El propietario lista su vehículo en el catálogo público para alquilarlo directamente a terceros (modelo Turo).
* **Ubicación:** Accesible desde la barra superior blanca (`PublicLayout.tsx`) en `/rent-your-car`.
* **Endpoint:** `POST /marketplace/upload` -> tabla `marketplace_cars`.
* **Moderación / Vista Admin:** `web.allatyou.com/marketplace` (`AdminMarketplace.tsx`).
* *(Ver especificación detallada en [marketplace.md](marketplace.md)).*

---

## 4. Reglas de Seguridad Anti-Spam y Casos Borde

1. **Honeypot Invisible:** Todos los formularios públicos incluyen un campo invisible `website`. Si contiene valor, el backend bloquea la petición con `400` silenciosamente.
2. **Placa Colombiana Estricta:** Validación estricta con regex `^[A-Z]{3}\d{3}$`. Los bots de spam que generan cadenas alfanuméricas aleatorias quedan bloqueados automáticamente.
3. **Manejo de Teléfonos con Prefijo Internacional (+57):**
   * El reemplazo ingenuo `.replace(/\D/g, "").slice(0, 10)` convierte `+57 300 123 4567` en `5730012345` (número corrupto).
   * **Regla:** Solo retirar el prefijo `57` cuando la cadena de dígitos supere los 10 dígitos:
     ```ts
     let digits = raw.replace(/\D/g, "");
     if (digits.length > 10 && digits.startsWith("57")) digits = digits.slice(2);
     return digits.slice(0, 10);
     ```
   * En el HTML, el `<input>` debe tener `maxLength={18}` para que el navegador no corte el texto pegado antes de ejecutar el `onChange`.
4. **Filtro Anti-Gibberish sin Falsos Positivos:**
   * La detección de mayúsculas/minúsculas alternas (camelCase aleatorio de bots) **solo** se evalúa en palabras de 10 o más letras para evitar bloquear apellidos y nombres legítimos como `McDonald`, `DiCaprio`, `LeBlanc` o `JuanCarlos`.
   * Los mensajes de error al usuario deben mantener un tono neutro (*"Revisa el nombre, parece tener un error de escritura"*).
5. **Fotos Seguras en R2:**
   * Al enviar imágenes a `${API}/uploads`, siempre debe especificarse `folder: "vehicles"`. Omitirlo provoca que se clasifique como `"proofs"` y se ejecute innecesariamente el OCR de recibos bancarios.
   * El backend solo acepta URLs de fotos que pertenezcan al dominio configurado en `process.env.R2_PUBLIC_URL`.
6. **Manejo de Placa Duplicada (409 Conflict):**
   * Cuando la placa ya está registrada en el sistema, el formulario no solo muestra el error sino un botón de contacto directo a WhatsApp de soporte con mensaje pre-redactado para desbloquear al propietario legítimo.
7. **Compresión Automática de Imágenes (`compressImage.ts`):**
   * Antes de transferirse a `${API}/uploads`, las fotos de vehículos y documentos se redimensionan a máx `1600px` y se comprimen a JPEG `0.8` usando canvas nativo en el cliente. Reduce el almacenamiento en Cloudflare R2 en más de un 95% y evita fallos por timeout en redes móviles.

---

## 5. Utilidades y SEO Hooks
* `allatyou.com/?tool=pico-placa` -> Abre modal de Pico y Placa.
* `allatyou.com/?tool=recordatorios` -> Abre modal de Recordatorios.
* `allatyou.com/?plate=ABC123` -> Abre recordatorios pre-llenando la placa.
