import { supabase } from '../lib/supabase';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Fórmula de Haversine para calcular distancia en kilómetros entre dos coordenadas GPS
 */
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radio de la tierra en KM
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) *
        Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Motor Sintético de Kilometraje
 * Calcula el kilometraje sumando la distancia entre los puntos GPS de la tabla `raw_telemetry`.
 * Requiere que el vehículo tenga al menos 1 reporte manual previo (baseline) para sumar sobre él.
 */
export async function syncProtrackMileage() {
    console.log("[MILEAGE-DAEMON] ⚙️ Iniciando Cálculo Sintético de Kilometraje...");

    try {
        // 1. Obtener vehículos con IMEI configurado
        const { data: vehicles } = await supabase
            .from('vehicles')
            .select('plate, gps_imei')
            .not('gps_imei', 'is', null);

        if (!vehicles || vehicles.length === 0) {
            console.log("[MILEAGE-DAEMON] No hay vehículos con gps_imei configurado.");
            return;
        }

        // 2. Definir ventana de tiempo a analizar (Ejemplo: últimas 24 horas)
        const now = new Date();
        // Restamos 12 o 24 horas dependiendo del cron, asumimos que este ciclo corre de forma segura cubriendo baches
        const windowStart = new Date(now.getTime() - (12 * 60 * 60 * 1000)).toISOString();

        // Obtener los puntos de telemetría recientes
        const { data: rawTelemetry } = await supabase
            .from('raw_telemetry')
            .select('imei, lat, lng, report_time')
            .gte('report_time', windowStart)
            .order('report_time', { ascending: true });

        if (!rawTelemetry || rawTelemetry.length === 0) {
            console.log("[MILEAGE-DAEMON] No hay pings de telemetría recientes en la BD para analizar.");
            return;
        }

        let insertedCount = 0;

        // 3. Procesar cálculo de distancia por cada vehículo
        for (const v of vehicles) {
            if (!v.gps_imei) continue;

            // a. Filtrar los pings GPS de este IMEI en la ventana especificada
            const pings = rawTelemetry.filter(t => t.imei === v.gps_imei);

            if (pings.length < 2) continue; // Necesitamos al menos 2 puntos para que haya distancia

            // b. Sumar la distancia entre pings consecutivos
            let distanceAccumulatedKm = 0;
            for (let i = 1; i < pings.length; i++) {
                const prev = pings[i - 1]!;
                const curr = pings[i]!;

                const distSegment = getDistanceKm(prev.lat, prev.lng, curr.lat, curr.lng);

                // Filtro Anti-Ruido: Si el GPS brinca locamente (> 10 km en 3 mins), ignorar ese salto
                if (distSegment < 10) {
                    distanceAccumulatedKm += distSegment;
                }
            }

            // Si se movió menos de 100 metros en total en el período, ni lo registramos
            if (distanceAccumulatedKm < 0.1) continue;

            // c. Insertar / Actualizar la métrica DIARIA
            const todayStringForUnique = new Date().toISOString().split("T")[0] + "T00:00:00Z";

            const { error } = await supabase
                .from('vehicle_mileage_logs')
                .upsert({
                    plate: v.plate,
                    imei: v.gps_imei,
                    mileage_km: Number(distanceAccumulatedKm.toFixed(2)),
                    recorded_at: todayStringForUnique,
                    source: 'protrack_api',
                    notes: 'Recorrido Diario GPS'
                }, { onConflict: 'plate, source, recorded_at' });

            if (!error || error.code === '23505') insertedCount++;
            if (error && error.code !== '23505') console.error(`[MILEAGE-DAEMON] Error BD:`, error.message);
        }

        console.log(`[MILEAGE-DAEMON] ✅ Ciclo Terminado. Se calcularon distancias diarias para ${insertedCount} vehículos.`);
    } catch (err: any) {
        console.error("[MILEAGE-DAEMON] Error fatal:", err.message);
    }
}

// Ejecución manual
if (require.main === module) {
    syncProtrackMileage().then(() => process.exit(0));
}
