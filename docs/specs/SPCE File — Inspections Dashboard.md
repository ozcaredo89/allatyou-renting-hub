# Especificación Técnica: Dashboard de Auditoría de Inspecciones

**Fecha:** 06-Feb-2026
**Autor:** AllAtYou Renting Hub
**Estado:** Implementado ✅

---

## 1. Resumen Ejecutivo
Este módulo proporciona una interfaz administrativa para visualizar, auditar y gestionar el historial de inspecciones realizadas a la flota. Permite a los administradores acceder a la evidencia centralizada y realizar **correcciones controladas** sobre los registros, garantizando la integridad de los datos mediante un sistema de bitácora (Logs de Auditoría).

---

## 2. Alcance Funcional

### 2.1 Listado Maestro (Global)
* Visualización tabular de las últimas inspecciones.
* Ordenamiento cronológico descendente.
* Datos clave: Fecha, Placa, Conductor, Tipo de evento y Inspector.

### 2.2 Visor de Detalle (Modal)
* **Reporte Escrito:** Visualización del texto ingresado por el inspector.
* **Galería de Evidencia:** Grid de imágenes con etiquetas legibles (ej: "Llanta Del. Izq.").
* **Modo Edición:** Permite a un administrador corregir errores en el reporte, cambiar el tipo de inspección o eliminar fotos erróneas.

### 2.3 Trazabilidad (Audit Logs)
* Cada modificación sobre una inspección existente genera un registro inmutable.
* **Panel de Historia:** Un sidebar dentro del visor muestra cronológicamente quién modificó el registro, cuándo y el motivo del cambio.

---

## 3. API Backend (`/inspections`)

### 3.1 Historial Global
* **Método:** `GET /`
* **Descripción:** Retorna las últimas 100 inspecciones con datos del conductor asociado.

### 3.2 Edición con Auditoría
* **Método:** `PUT /:id`
* **Body:**
    ```json
    {
      "comments": "Texto corregido...",
      "type": "entrega",
      "photos": { ... },
      "change_summary": "Corrección ortográfica" // Requerido para el Log
    }
    ```
* **Lógica:** Actualiza el registro en `inspections` e inserta una entrada en `inspection_logs` en la misma transacción lógica.

### 3.3 Consultar Logs
* **Método:** `GET /:id/logs`
* **Descripción:** Retorna el historial de cambios de una inspección específica.

---

## 4. Frontend & UI

### Componentes Clave

1.  **Tabla de Resumen:**
    * Indicadores visuales (`Badges`) para tipos de inspección.
    * Acceso rápido al detalle.

2.  **Modal de Detalle (Inteligente):**
    * **Modo Visualización:** Muestra fotos y textos estáticos.
    * **Modo Edición:** Convierte textos en `textarea` y habilita botones de borrar (`Trash`) sobre las fotos.
    * **Botón "Logs":** Despliega un panel lateral (`Sidebar`) con el historial de cambios.
    * **Validación:** Al guardar cambios, el sistema exige un motivo ("Prompt") antes de enviar la petición.

---

## 5. Reglas de Negocio y Seguridad
1.  **Auditoría Obligatoria:** No es posible editar una inspección sin proporcionar una justificación (`change_summary`).
2.  **Integridad de Fotos:** Desde el panel administrativo solo se pueden **eliminar** referencias a fotos incorrectas. Para agregar nuevas evidencias, se debe usar el flujo de carga original (App móvil) para garantizar el origen del archivo.
3.  **Acceso:** Solo usuarios autenticados con rol administrativo tienen permisos de escritura (`PUT`).