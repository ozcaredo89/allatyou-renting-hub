# Evidencia de kilometraje y gasolina por WhatsApp (Issue #75)

## Objetivo
Pedirle al conductor, mediante un link enviado por WhatsApp, el kilometraje actual del vehículo, el nivel de gasolina y una foto del tablero como evidencia.

## Flujo
1. En `/vehicles` → ícono de Kilometraje → pestaña **Odómetro Manual**, el admin pulsa **"Pedir km y gasolina al conductor (WhatsApp)"**.
2. El backend (`POST /mileage-evidence/:plate`, con `basicAuth`) crea una fila en `mileage_evidence_requests` con un token aleatorio y guarda el conductor actual (`vehicles.current_driver_id`) y el odómetro de referencia.
3. El frontend abre `wa.me` al teléfono del conductor (o WhatsApp sin destinatario si no tiene teléfono) con el link `/km/:token`.
4. El conductor abre el link (público, sin login), digita el km, elige el nivel de gasolina y sube **1 foto del tablero** donde se vean el km y la aguja de gasolina.
5. Al enviar (`POST /public/mileage-evidence/:token`, multipart) se sube la foto a R2 (`mileage-evidence/`), se inserta la lectura en `vehicle_mileage_logs` con `source = 'manual'` (lectura absoluta) y la solicitud queda `completed`.
6. En el historial manual, las lecturas que vienen del conductor se muestran con la etiqueta **Conductor**, el nivel de gasolina y la miniatura de la foto. Las solicitudes pendientes se ven arriba con opción de copiar el link.

## Reglas
- **Km mayor al anterior**: el km digitado debe ser **estrictamente mayor** al odómetro de referencia = máximo entre el odómetro actual (`getCurrentOdometers`: última lectura manual + km GPS posteriores) al momento de enviar y el que se congeló al crear el link. Si el vehículo no tiene odómetro previo, se acepta cualquier valor positivo. Se valida en frontend y backend.
- **Campos obligatorios**: km, nivel de gasolina (`empty`, `1/4`, `1/2`, `3/4`, `full`) y foto (solo imágenes).
- **Un solo uso**: un link completado no se puede volver a enviar (409).
- **Vigencia**: el link vence a los **7 días** de creado (410). Para reintentar se genera uno nuevo.
- Generar un link nuevo no invalida los anteriores pendientes.
