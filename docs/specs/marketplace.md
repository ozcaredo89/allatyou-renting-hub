# Especificación Técnica: Marketplace P2P (Modelo Turo)

**Fecha:** 26-Oct-2026
**Autor:** AllAtYou Renting Hub
**Módulo:** Captación y Renta Comercial
**Estado:** Implementado ✅

---

## 1. Resumen Ejecutivo
El módulo Marketplace transforma la plataforma en un modelo de negocio híbrido, permitiendo a terceros ("Hosts") listar sus vehículos para ser rentados por clientes finales. El sistema gestiona el ciclo de vida completo: **Captación (Lead)** -> **Moderación (Admin)** -> **Publicación (Catálogo)** -> **Conversión (WhatsApp)**.

---

## 2. Alcance Funcional

### 2.1 Captación (Público - Oferta)
* **Formulario de Alta:** Página pública `/rent-your-car` accesible desde la barra superior de la Landing (`PublicLayout.tsx`).
* **Catálogo Guiado de Marcas y Líneas:** Selector de marcas comerciales en Colombia (`Chevrolet`, `Kia`, `Renault`, `Mazda`, `Nissan`, `Suzuki`, `Honda`, `Toyota`, `Hyundai`, `Ford`, `Volkswagen`, `Otra`) con líneas predefinidas y opción `"Otra línea..."`.
* **UX Móvil:** Integración de cámara nativa vía WebRTC y Action Sheet para facilitar la toma de fotos del vehículo en el momento (subidas a la carpeta `vehicles` en R2 sin activar el OCR de recibos).
* **Datos Requeridos:** Propietario, Celular colombiano de 10 dígitos, Correo electrónico, Ciudad, Marca, Línea, Año (1990 al año siguiente), Placa colombiana (`ABC123`) y Precio Esperado.

### 2.2 Moderación (Administrativo)
* **Panel de Control:** Ruta `/marketplace` en la app administrativa (`web.allatyou.com/marketplace`).
* **Flujo de Estado:**
    * `pending`: Estado inicial. Visible solo para admin.
    * `approved`: Visible en el catálogo público.
    * `rejected`: Oculto y archivado.
* **Acciones:** Botones de aprobación/rechazo rápido.

### 2.3 Catálogo (Público - Demanda)
* **Vitrina Digital:** Página `/rent`. Muestra solo vehículos con estado `approved`.
* **Conversión:** No procesa pagos en línea (MVP). Utiliza un **CTA de WhatsApp Link** pre-llenado con el ID y modelo del carro para cerrar la venta manualmente.

---

## 3. Arquitectura de Datos

### Tabla: `marketplace_cars`
* `status`: Enum (`pending`, `approved`, `rejected`, `rented`).
* `owner_info`: Datos de contacto sensibles (teléfono) no se exponen en el catálogo público, solo al admin.
* `vehicle_info`: Marca, modelo, año, transmisión, fotos.

---

## 4. API & Endpoints

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/marketplace/upload` | Público | Recepción de nuevos vehículos (Leads) con validaciones anti-spam. |
| `GET` | `/marketplace/catalog` | Público | Lista vehículos `approved` (Vitrina). |
| `GET` | `/marketplace/admin/all` | Privado (`basicAuth`) | Lista todo para moderación (montado en `src/index.ts` bajo `/marketplace/admin`). |
| `PUT` | `/marketplace/admin/:id/status` | Privado (`basicAuth`) | Cambia estado (Aprobar/Rechazar). |

---

## 5. Seguridad y Reglas de Negocio
1. **Validación de Leads:** El sistema no publica automáticamente. Requiere intervención humana (Admin) para filtrar fraudes o vehículos en mal estado.
2. **Protección Anti-Spam y Validaciones de Entrada (`POST /marketplace/upload` y `POST /vehicle-applications`):**
    * **Honeypot (`website`):** Campo oculto en el formulario; si recibe contenido, el backend rechaza la solicitud con `400`.
    * **Detector Anti-Basura (`isGibberishText`):** Rechaza palabras de más de 25 caracteres, secuencias de 6 o más consonantes seguidas, o alternancia caótica de mayúsculas/minúsculas en palabras de 10 o más letras.
    * **Placa Colombiana:** Formato estricto `^[A-Z]{3}\d{3}$` (3 letras y 3 números) y verificación anti-duplicados (`409 Conflict` con CTA a WhatsApp de soporte).
    * **Celular Colombiano:** Normalización automática del prefijo `+57` cuando supera los 10 dígitos y validación de formato `^3\d{9}$`.
    * **Año del Vehículo:** Rango permitido desde `1990` hasta `año actual + 1`.
3. **Autenticación Administrativa (`basicAuth`):** Las rutas `/marketplace/admin/*` están protegidas en `src/index.ts` mediante el middleware `basicAuth`.
4. **Protección de Datos:** La placa (`plate`) se captura para antecedentes pero **nunca** se muestra en el catálogo público por seguridad.
5. **Integridad:** Las fotos se almacenan en R2 bajo la carpeta `vehicles` y se referencian en la tabla correspondiente.

---

## 6. Lecciones Aprendidas y Casos Borde Reales (Oct-2026)

### 6.1 El dilema de los dos flujos de vehículos (Landing vs Marketplace)
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
