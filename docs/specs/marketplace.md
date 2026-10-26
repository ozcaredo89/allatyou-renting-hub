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

## 5. Seguridad, Validaciones y Reglas de Negocio
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
