# Especificación Técnica: Marketplace P2P (Modelo Turo)

**Fecha:** 07-Feb-2026
**Autor:** AllAtYou Renting Hub
**Módulo:** Captación y Renta Comercial
**Estado:** Implementado ✅

---

## 1. Resumen Ejecutivo
El módulo Marketplace transforma la plataforma en un modelo de negocio híbrido, permitiendo a terceros ("Hosts") listar sus vehículos para ser rentados por clientes finales. El sistema gestiona el ciclo de vida completo: **Captación (Lead)** -> **Moderación (Admin)** -> **Publicación (Catálogo)** -> **Conversión (WhatsApp)**.

---

## 2. Alcance Funcional

### 2.1 Captación (Público - Oferta)
* **Formulario de Alta:** Página pública `/rent-your-car` accesible desde la Landing.
* **UX Móvil:** Integración de cámara nativa vía WebRTC y Action Sheet para facilitar la toma de fotos del vehículo en el momento.
* **Datos Requeridos:** Propietario, Contacto, Ciudad, Datos Técnicos del Vehículo y Precio Esperado.

### 2.2 Moderación (Administrativo)
* **Panel de Control:** Ruta `/admin/marketplace`.
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
| `POST` | `/marketplace/upload` | Público | Recepción de nuevos vehículos (Leads). |
| `GET` | `/marketplace/catalog` | Público | Lista vehículos `approved` (Vitrina). |
| `GET` | `/marketplace/admin/all` | Privado | Lista todo para moderación. |
| `PUT` | `/marketplace/admin/:id/status` | Privado | Cambia estado (Aprobar/Rechazar). |

---

## 5. Seguridad y Reglas de Negocio
1.  **Validación de Leads:** El sistema no publica automáticamente. Requiere intervención humana (Admin) para filtrar fraudes o vehículos en mal estado.
2.  **Protección de Datos:** La placa (`plate`) se captura para antecedentes pero **nunca** se muestra en el catálogo público por seguridad.
3.  **Integridad:** Las fotos se almacenan en el mismo bucket `uploads` pero referenciadas a la tabla de marketplace.