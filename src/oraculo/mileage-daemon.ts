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

// Colombia no tiene horario de verano: el día local empieza siempre a las 05:00 UTC
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Velocidad implícita por encima de la cual un tramo se considera salto del GPS (Issue #79)
const MAX_PLAUSIBLE_KMH = 160;
const PAGE_SIZE = 1000;

type Ping = { imei: string; lat: number; lng: number; speed: number; accstatus: number; report_time: string };

/** Inicio (UTC) del día de Bogotá que contiene `at`. */
function bogotaDayStart(at: number): number {
    const local = at - BOGOTA_OFFSET_MS;
    return local - (local % DAY_MS) + BOGOTA_OFFSET_MS;
}

/** Pings de los IMEIs de la flota en [from, to), paginados (límite de 1000 filas). */
async function fetchPings(imeis: string[], from: string, to: string): Promise<Ping[]> {
    const out: Ping[] = [];
    for (let page = 0; ; page++) {
        const { data, error } = await supabase
            .from('raw_telemetry')
            .select('imei, lat, lng, speed, accstatus, report_time')
            .in('imei', imeis)
            .gte('report_time', from)
            .lt('report_time', to)
            .order('report_time', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        out.push(...((data || []) as Ping[]));
        if (!data || data.length < PAGE_SIZE) break;
    }
    return out;
}

/**
 * Distancia de un tramo entre dos pings consecutivos, o 0 si el tramo es ruido:
 *  - motor apagado y velocidad 0 en ambos pings → carro estacionado (jitter del GPS).
 *    Se exigen las dos señales por si algún equipo no reporta bien el ACC.
 *  - velocidad implícita imposible → salto del GPS
 * Un hueco largo entre pings (p. ej. caída de la ingesta) SÍ cuenta si la velocidad
 * implícita es plausible: antes se descartaba todo tramo > 10 km.
 */
function segmentKm(prev: Ping, curr: Ping): number {
    const parked = (p: Ping) => Number(p.accstatus) === 0 && Number(p.speed) === 0;
    if (parked(prev) && parked(curr)) return 0;
    const dist = getDistanceKm(prev.lat, prev.lng, curr.lat, curr.lng);
    const hours = (new Date(curr.report_time).getTime() - new Date(prev.report_time).getTime()) / 3600000;
    if (hours <= 0) return 0;
    if (dist / hours > MAX_PLAUSIBLE_KMH) return 0;
    return dist;
}

/**
 * Motor Sintético de Kilometraje (Issue #79)
 * Calcula el RECORRIDO DIARIO de cada vehículo con GPS sumando la distancia entre los
 * pings de `raw_telemetry` del día calendario COMPLETO en hora de Colombia.
 *
 * Es idempotente: en cada pasada recalcula los últimos `daysBack` días + hoy (por
 * defecto ayer y hoy) y reemplaza las filas `protrack_api` de esos días. Así un reinicio
 * del servidor (deploy) no pisa el día con una ventana parcial, y el final del día
 * se completa en la pasada del día siguiente.
 *
 * Fila por día: recorded_at = inicio del día de Bogotá (05:00 UTC). Si ese día hay una
 * lectura manual del odómetro, el día se parte en dos filas: lo recorrido antes de la
 * lectura (al inicio del día) y lo recorrido después (lectura + 1 s), para que el
 * odómetro (`lib/odometer.ts`: última manual + GPS posterior) sume solo lo de después.
 */
export async function syncProtrackMileage(daysBack = 1) {
    console.log(`[MILEAGE-DAEMON] ⚙️ Recalculando recorrido diario GPS (últimos ${daysBack} día(s) + hoy)...`);

    try {
        const { data: vehicles } = await supabase
            .from('vehicles')
            .select('plate, gps_imei')
            .not('gps_imei', 'is', null);

        if (!vehicles || vehicles.length === 0) {
            console.log("[MILEAGE-DAEMON] No hay vehículos con gps_imei configurado.");
            return;
        }

        const imeis = Array.from(new Set(vehicles.map(v => String(v.gps_imei))));
        const plates = vehicles.map(v => v.plate);
        const todayStart = bogotaDayStart(Date.now());
        let rowsWritten = 0;

        for (let d = daysBack; d >= 0; d--) {
            const dayStart = todayStart - d * DAY_MS;
            const dayEnd = dayStart + DAY_MS;
            const fromIso = new Date(dayStart).toISOString();
            const toIso = new Date(dayEnd).toISOString();

            const pings = await fetchPings(imeis, fromIso, toIso);
            if (pings.length === 0) continue;

            // Última lectura manual de cada placa dentro del día (para partir el recorrido)
            const { data: manuals, error: manErr } = await supabase
                .from('vehicle_mileage_logs')
                .select('plate, recorded_at')
                .eq('source', 'manual')
                .in('plate', plates)
                .gte('recorded_at', fromIso)
                .lt('recorded_at', toIso);
            if (manErr) throw manErr;
            const manualAt = new Map<string, number>();
            for (const m of manuals || []) {
                const at = new Date(m.recorded_at).getTime();
                if (!manualAt.has(m.plate) || at > manualAt.get(m.plate)!) manualAt.set(m.plate, at);
            }

            for (const v of vehicles) {
                const own = pings.filter(p => p.imei === v.gps_imei);
                // Sin pings ese día: no tocamos lo que haya (no hay datos para recalcular)
                if (own.length === 0) continue;

                const split = manualAt.get(v.plate);
                let before = 0;
                let after = 0;
                for (let i = 1; i < own.length; i++) {
                    const km = segmentKm(own[i - 1]!, own[i]!);
                    // Tramo que termina antes (o en) la lectura manual → "antes"; el resto → "después"
                    if (split !== undefined && new Date(own[i]!.report_time).getTime() <= split) before += km;
                    else after += km;
                }

                const rows: { recorded_at: string; km: number }[] = [];
                if (split === undefined) {
                    rows.push({ recorded_at: fromIso, km: before + after });
                } else {
                    rows.push({ recorded_at: fromIso, km: before });
                    rows.push({ recorded_at: new Date(split + 1000).toISOString(), km: after });
                }

                // Reemplazar las filas GPS del día. Para el primer día del rango también se
                // borra la fila del formato anterior (medianoche UTC = 19:00 del día previo en
                // Bogotá), que cubría parte de este mismo día.
                const deleteFrom = d === daysBack ? new Date(dayStart - BOGOTA_OFFSET_MS).toISOString() : fromIso;
                const { error: delErr } = await supabase
                    .from('vehicle_mileage_logs')
                    .delete()
                    .eq('plate', v.plate)
                    .eq('source', 'protrack_api')
                    .gte('recorded_at', deleteFrom)
                    .lt('recorded_at', toIso);
                if (delErr) {
                    console.error(`[MILEAGE-DAEMON] Error borrando ${v.plate}:`, delErr.message);
                    continue;
                }

                const inserts = rows
                    .filter(r => r.km >= 0.01)
                    .map(r => ({
                        plate: v.plate,
                        imei: v.gps_imei,
                        mileage_km: Number(r.km.toFixed(2)),
                        recorded_at: r.recorded_at,
                        source: 'protrack_api',
                        notes: 'Recorrido Diario GPS',
                    }));
                if (inserts.length === 0) continue;

                const { error } = await supabase.from('vehicle_mileage_logs').insert(inserts);
                if (error) console.error(`[MILEAGE-DAEMON] Error BD ${v.plate}:`, error.message);
                else rowsWritten += inserts.length;
            }
        }

        console.log(`[MILEAGE-DAEMON] ✅ Ciclo terminado. ${rowsWritten} fila(s) de recorrido diario escritas.`);
    } catch (error: any) {
        console.error("CRITICAL GPS SYNC ERROR:", error);
    }
}

// Ejecución manual para recalcular días pasados:
//   npx ts-node src/oraculo/mileage-daemon.ts 30   → últimos 30 días + hoy
if (require.main === module) {
    const days = Math.max(0, Math.min(365, Number(process.argv[2] ?? 1) || 1));
    syncProtrackMileage(days).then(() => process.exit(0));
}
