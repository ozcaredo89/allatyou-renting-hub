# Evidencia de kilometraje y gasolina por WhatsApp (Issue #75)

## Objetivo
Pedirle al conductor, mediante un link enviado por WhatsApp, el kilometraje actual del vehículo, el nivel de gasolina y una foto del tablero como evidencia.

## Flujo
1. En `/vehicles` → ícono de Kilometraje → pestaña **Odómetro Manual**, el admin pulsa **"Pedir km y gasolina al conductor (WhatsApp)"**.
2. El backend (`POST /mileage-evidence/:plate`, con `basicAuth`) crea una fila en `mileage_evidence_requests` con un token aleatorio y guarda el conductor actual (`vehicles.current_driver_id`) y el odómetro de referencia.
3. El frontend abre WhatsApp (`api.whatsapp.com/send`, no `wa.me`: su redirección daña los emojis) al teléfono del conductor (o sin destinatario si no tiene teléfono) con el link `/km/:token`. El saludo usa el primer nombre en formato "Jorge".
4. El conductor abre el link (público, sin login), digita el km, elige el nivel de gasolina y toma **1 foto del tablero** con la cámara trasera del celular donde se vean el km y la aguja de gasolina. Ve la foto antes de enviar y puede **retomarla** ("Tomar otra foto") las veces que quiera; solo se sube la última.
5. Al enviar (`POST /public/mileage-evidence/:token`, multipart) se sube la foto a R2 (`mileage-evidence/`), se inserta la lectura en `vehicle_mileage_logs` con `source = 'manual'` (lectura absoluta) y la solicitud queda `completed`.
6. En el historial manual, las lecturas que vienen del conductor se muestran con la etiqueta **Conductor**, el nivel de gasolina y la miniatura de la foto. Las solicitudes pendientes se ven arriba con opción de copiar el link.

## Reglas
- **Km mayor al anterior**: el km digitado debe ser **estrictamente mayor** al odómetro de referencia = máximo entre el odómetro actual (`getCurrentOdometers`: última lectura manual + km GPS posteriores) al momento de enviar y el que se congeló al crear el link. Si el vehículo no tiene odómetro previo, se acepta cualquier valor positivo. Se valida en frontend y backend.
- **Campos obligatorios**: km, nivel de gasolina (`empty`, `1/4`, `1/2`, `3/4`, `full`) y foto (solo imágenes).
- **Un solo uso**: un link completado no se puede volver a enviar (409).
- **Vigencia**: el link vence a los **7 días** de creado (410). Para reintentar se genera uno nuevo.
- Generar un link nuevo no invalida los anteriores pendientes.

## Odómetro y recorrido diario GPS (Issue #79)
- **Odómetro actual** = última lectura manual (inspección, registro manual o evidencia del conductor) + recorrido GPS registrado **después** de ella (`lib/odometer.ts`, RPC `get_global_mileage_stats`).
- **Recorrido diario GPS** (`oraculo/mileage-daemon.ts`, filas `source = 'protrack_api'`): suma de la distancia entre pings de `raw_telemetry` del **día calendario completo en hora de Colombia**. Una fila por día con `recorded_at` = 00:00 de Bogotá (05:00 UTC).
- **Idempotente**: corre al arrancar el API y cada 12 h, y en cada pasada **recalcula ayer y hoy** reemplazando sus filas. Un deploy/reinicio ya no deja el día con una ventana parcial.
- Si el día tiene una lectura manual, el recorrido se parte en dos filas: antes de la lectura (00:00) y después (hora de la lectura + 1 s), para que el odómetro solo sume lo posterior.
- **Ruido descartado**: tramos con motor apagado y velocidad 0 en ambos pings (carro estacionado) y tramos con velocidad implícita > 160 km/h (saltos del GPS). Un hueco largo entre pings sí cuenta si la velocidad implícita es plausible.
- Limitación conocida: es distancia en línea recta entre pings cada ~3 min, así que en calles con curvas queda algo por debajo del real; las lecturas manuales/evidencia del conductor corrigen la base.
- **Recalcular días pasados** (solo si hay `raw_telemetry` de esos días; días sin pings no se tocan): `npx ts-node src/oraculo/mileage-daemon.ts 30` con el `.env` de producción.

- **Carros vendidos** (Issue #83): el cálculo GPS y el sync de IMEI ignoran los vehículos `sold`; un vendido que comparta IMEI con un carro activo pierde el IMEI (su GPS se reinstaló en otro carro).
