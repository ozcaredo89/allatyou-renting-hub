# SPEC: Onboarding y Registro de Vehículos (Landing & Marketplace)
**Versión:** 3.0 (Octubre 2026)  
**Estado:** Producción  
**Archivos clave frontend:**  
- `web/src/components/VehicleApplicationForm.tsx` (Landing Propietarios)
- `web/src/pages/RentYourCar.tsx` (Marketplace P2P)
- `web/src/components/VehicleModelCombobox.tsx` (Buscador/Autocomplete modelos)
- `web/src/components/VehicleDateField.tsx` (Fechas asistidas SOAT/Tecno)
- `web/src/constants/vehicleCatalog.ts` (Marcas y líneas estándar)
- `web/src/utils/compressImage.ts` (Compresión cliente en canvas)
**Archivos clave backend:**  
- `src/routes/vehicleApplications.ts` (`POST /vehicle-applications`)
- `src/routes/marketplace.ts` (`POST /marketplace/upload`)
- `src/lib/vehicleImageClassifier.ts` (Clasificación visión IA en background)

---

## 1. Mapa Rápido de los Dos Flujos (¡No Confundir!)

| Característica | 1. Landing Page (Flota Administrada) | 2. Marketplace P2P (Alquiler Directo) |
| :--- | :--- | :--- |
| **Público objetivo** | Propietario inversionista que cede la administración a AllAtYou. | Propietario que lista su vehículo para alquilar a terceros (estilo Turo). |
| **Ruta Frontend** | `allatyou.com/#propietarios` y modal de simulador (`TabIncome.tsx`). | `allatyou.com/rent-your-car` (Header público). |
| **Componente Formulario** | `VehicleApplicationForm.tsx` (Modal/Wizard 4 pasos, tema oscuro). | `RentYourCar.tsx` (Página completa, tema claro). |
| **Endpoint Backend** | `POST /vehicle-applications` | `POST /marketplace/upload` |
| **Tabla Supabase** | `vehicle_applications` | `marketplace_cars` |
| **Destino Admin** | `web.allatyou.com/recruitment` -> Pestaña **"Vehículos"** (`AdminRecruitment.tsx`). | `web.allatyou.com/marketplace` (`AdminMarketplace.tsx`). |

---

## 2. Componentes de UI Estándar y Reglas de UX

### 2.1 Buscador y Autocomplete de Modelos (`VehicleModelCombobox.tsx`)
* **Problema resuelto:** Los `<select>` rígidos frustraban al usuario cuando su modelo no aparecía (ej. Honda Odyssey) o lo forzaban a un segundo campo "Otra línea" que desordenaba el formulario.
* **Comportamiento:**
  1. Catálogo unificado en `web/src/constants/vehicleCatalog.ts` (incluye marcas como BYD, Chery, BMW, etc., y modelos como Honda Odyssey).
  2. Búsqueda y filtrado en tiempo real mientras el usuario escribe.
  3. **Modelos no listados (Cero fricción):** Si el usuario escribe un modelo o versión inexistente en la lista, el texto escrito se asigna inmediatamente al valor del formulario y se muestra la opción `➕ Usar "[texto]" (Nuevo)`.
  4. **Feedback visual:** Muestra `✓ Modelo verificado de [Marca]` o `✏️ Modelo personalizado para [Marca]` para brindar total certeza al usuario.
  5. Soporta temas `variant="dark"` (Landing) y `variant="light"` (Marketplace).

### 2.2 Fechas Asistidas SOAT y Tecnomecánica (`VehicleDateField.tsx`)
* **Premisa de negocio:** Cuando un propietario postula un vehículo para renting, **se asume que la documentación no está vencida**. Forzar campos de fecha vacíos genera desorientación y fricción.
* **Comportamiento:**
  1. **Pre-llenado tentativo real:** Se inicializan automáticamente a **+6 meses** de la fecha actual (`getFutureDate(6)`).
  2. **Disparo directo de calendario (`showPicker()`):** Al tocar el recuadro o el icono, el navegador abre directamente el selector nativo posicionado en el mes futuro sugerido.
  3. **Chips de 1-toque:** `+6 meses`, `Fin de año` (31 dic del año actual o mitad del próximo si es nov/dic), y `+1 año`.
  4. **Semáforo en tiempo real:** Muestra badge `✓ Vigente` (verde) si la fecha es futura, o `⚠️ Vencido` (ámbar) si es pasada.
  5. **Borrado limpio:** Botón `(X)` para dejarlo vacío si el usuario desea no especificarlo (campos opcionales).

### 2.3 Subida de Fotos, Protección de Cuota y Visión IA
* **Diferencia de obligatoriedad según el modelo de negocio:**
  - **Marketplace (`RentYourCar`):** Alquiler directo en catálogo público P2P. **Obligatoria mínimo 1 foto** (portada), máximo **2 fotos** (1 exterior + 1 interior opcional). Si no hay foto interior, queda en `null` (nunca duplicar la exterior).
  - **Landing (`VehicleApplicationForm`):** Captación de flota administrada. Fotos **opcionales pero muy recomendadas**, con un tope estricto de **máximo 8 fotos**. Si el dueño no las tiene, se toman durante el peritaje presencial.
* **Tope estricto de fotos (Protección de costos IA y cuota R2):**
  - Backend rechaza con `422` peticiones con más de 2 fotos en Marketplace o más de 8 fotos en Landing.
  - Evita ataques de denegación o saturación de cuota en Gemini/OpenAI que puedan frenar la cola concurrente de OCR de pagos.
* **UX Móvil: Botón de eliminación siempre visible:**
  - En pantallas táctiles de celular no existe el evento `hover`. El botón de eliminar (🗑️) debe estar **permanentemente visible** en la esquina superior derecha de cada miniatura con área táctil cómoda (`w-7 h-7`), junto con el badge indicador de posición a la izquierda.
* **Resiliencia en subida por lote y límite notificado:**
  - El estado local se actualiza progresivamente foto por foto. Si una imagen falla a mitad del lote, las anteriores exitosas **no se descartan** y el mensaje de error se reporta en el banner sin usar `alert()`.
  - Si el usuario selecciona en la galería más fotos del límite permitido (más de 2 en marketplace o más de 8 en landing), la UI no hace un recorte silencioso: sube las permitidas y muestra un aviso informando cuántas se cargaron por tope de cupo.
  - El input tipo archivo siempre resetea su valor (`e.target.value = ""`) para permitir volver a elegir la misma foto si el usuario la borró por error.
* **Compresión en cliente (`compressImage.ts`):** Antes de enviar a `${API}/uploads`, se redimensiona a máx `1600px` y se comprime en canvas a JPEG `0.8`. Reduce el peso de 5-15MB a ~150-300KB (>95% ahorro).
* **Carpeta R2 obligatoria:** `fd.append("folder", "vehicles")`. **NUNCA omitir**: si se omite, el backend asume `"proofs"` y dispara el OCR concurrente de pagos, saturando el servidor.
* **Clasificador IA en segundo plano (`vehicleImageClassifier.ts`):**
  - Se ejecuta asíncronamente vía `setImmediate` tras responder HTTP `200/201`. No agrega latencia al usuario.
  - Valida si es vehículo (`is_vehicle`), identifica ángulo (`frente`, `tres_cuartos`, `tablero`, etc.) y auto-asigna la mejor portada en Marketplace.
  - **Intercambio inteligente anti-duplicados:** Si la IA detecta que la segunda foto es la mejor portada exterior, intercambia las fotos (`photo_exterior_url` $\leftrightarrow$ `photo_interior_url`), garantizando que la foto interior nunca quede duplicada con la exterior.
  - **Fallback sin etiquetas inventadas:** Si la IA falla o se agota la cuota, la foto se marca como `kind: "general"`, `tag: "sin_clasificar"`. Jamás inventa etiquetas anatómicas falsas que confundan al administrador.

---

## 3. Matriz de Campos y Validaciones

| Campo | Flujo | Tipo / Componente | Obligatorio | Valor por Defecto / Sugerido | Validación Backend |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`brand`** | Ambos | Select / `BRANDS` | Sí | `"Chevrolet"` | String $\ge 2$ letras, anti-spam. |
| **`line` / `model`** | Ambos | `VehicleModelCombobox` | Sí | `""` | String $\ge 1$ letra, anti-spam. |
| **`year` / `model_year`** | Ambos | Number / Input | Sí | Año actual | Entre `1990` y `año actual + 1`. |
| **`plate`** | Ambos | Text (mayúsculas) | Sí | `""` | `^[A-Z]{3}\d{3}$` (3 letras, 3 números). Anti-duplicados (409). |
| **`owner_phone` / `phone`** | Ambos | Tel / Text | Sí | `""` | `^3\d{9}$` (10 dígitos colombianos). Limpieza de `+57`. |
| **`soatDate`** | Landing | `VehicleDateField` | No | `+6 meses` (`YYYY-MM-DD`) | ISO Date o null. |
| **`technoDate`** | Landing | `VehicleDateField` | No | `+6 meses` (`YYYY-MM-DD`) | ISO Date o null. |
| **`photos`** | Ambos | Multi-file + Cámara | No (Landing) / Sí (Mkt) | `[]` | URLs válidas pertenecientes a `R2_PUBLIC_URL`. |
| **`website`** | Ambos | Hidden Input (Honeypot) | No | `""` | Debe estar vacío. Si tiene valor $\rightarrow$ rechazo `400`. |

---

## 4. Reglas Críticas Anti-Spam y Casos Borde

1. **Honeypot invisible (`website`):** Bloquea bots silenciosamente con `400`.
2. **Placa Colombiana estricta:** Regex `^[A-Z]{3}\d{3}$`. Manejo de duplicados con status `409` y botón de auxilio directo a WhatsApp de soporte.
3. **Normalización de Teléfono con prefijo internacional (`+57`):**
   - El reemplazo ingenuo `.replace(/\D/g, "").slice(0, 10)` corrompe `+57 300 123 4567` en `5730012345`.
   - **Regla:** Solo remover el prefijo `57` si el total de dígitos es estrictamente mayor a 10.
   - En el HTML, el input debe tener `maxLength={18}` para permitir pegar números formateados antes del evento `onChange`.
4. **Filtro Anti-Gibberish sin falsos positivos:**
   - La alternancia de mayúsculas/minúsculas caóticas solo se evalúa en palabras de 10 o más caracteres (`word.length >= 10`) para no bloquear apellidos reales como `McDonald`, `DiCaprio` o `LeBlanc`.
5. **Visibilidad de errores en móviles:**
   - En pantallas pequeñas con scroll, cualquier error debe disparar `scrollIntoView({ behavior: "smooth", block: "center" })` sobre el banner de error.
