import { supabase } from '../lib/supabase';
import { getFleetTelemetry, TelemetryData } from './oracle';

export interface OracleNode {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
    category: string;
    suggested_dwell_time_mins: number;
}

interface VehicleState {
    imei: string;
    currentNodeId: string | null;
    entryTime: Date | null;
    accOffSince: Date | null;
    recordedEvent: boolean;
}

// Estado en memoria de la flota para calcular Dwell Times
const fleetState: Map<string, VehicleState> = new Map();

/**
 * Fórmula de Haversine para calcular distancia en metros entre dos coordenadas GPS
 */
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la tierra en metros
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
 * Motor Principal del Oráculo
 */
export async function runOracleEngine() {
    console.log("==========================================");
    console.log(`[ORACLE-ENGINE] Iniciando Ciclo: ${new Date().toISOString()}`);

    try {
        // 1. Cargar Nodos Comerciales de Supabase a la RAM (Caché rápido)
        const { data: nodes, error: nodesErr } = await supabase
            .from('oracle_nodes')
            .select('*')
            .eq('is_active', true);

        if (nodesErr) throw new Error("Fallo al cargar oracle_nodes: " + nodesErr.message);
        if (!nodes || nodes.length === 0) {
            console.log("[ORACLE-ENGINE] No hay nodos activos configurados en Supabase. Terminando ciclo.");
            return;
        }

        console.log(`[ORACLE-ENGINE] ${nodes.length} Nodos cargados en memoria.`);

        // 2. Extraer Telemetría en Tiempo Real (Ingesta Masiva)
        const telemetry = await getFleetTelemetry();
        console.log(`[ORACLE-ENGINE] Telemetría leída para ${telemetry.length} vehículos.`);

        // 2.1 INYECTAR EN DATALAKE CRUDO (Pivot Comercial Fase 4)
        if (telemetry.length > 0) {
            const rawPayload = telemetry.map(t => ({
                imei: t.imei,
                lat: t.latitude,
                lng: t.longitude,
                speed: t.speed,
                accstatus: t.accstatus,
                report_time: new Date().toISOString()
            }));

            const { error: rawErr } = await supabase.from('raw_telemetry').insert(rawPayload);
            if (rawErr) {
                console.error("[ORACLE-ENGINE] Alerta no bloqueante: Fallo insertando raw_telemetry", rawErr.message);
            } else {
                console.log(`[ORACLE-ENGINE] ${telemetry.length} Coordenadas inyectadas al DataLake (Organic Clustering).`);
            }
        }

        // 3. Cruce Geoespacial y Máquina de Estados (Nodos Fijos)
        for (const vehicle of telemetry) {
            // Inicializar estado si es la primera vez que vemos este vehículo
            if (!fleetState.has(vehicle.imei)) {
                fleetState.set(vehicle.imei, {
                    imei: vehicle.imei,
                    currentNodeId: null,
                    entryTime: null,
                    accOffSince: null,
                    recordedEvent: false
                });
            }

            const state = fleetState.get(vehicle.imei)!;
            let isInsideAnyNode = false;

            // Evaluar colisión contra todos los nodos 
            // (Opcional futuro: Si son miles de nodos, usar PostGIS o R-Tree. Para <1000 nodos, un FOR es inmediato en V8)
            for (const node of nodes as OracleNode[]) {
                const distance = getDistanceMeters(vehicle.latitude, vehicle.longitude, node.latitude, node.longitude);

                if (distance <= node.radius_meters) {
                    isInsideAnyNode = true;

                    // Lógica: Entrando a un Nodo Nuevo o Manteniéndose
                    if (state.currentNodeId !== node.id) {
                        console.log(`📍 [EVENTO] Vehículo ${vehicle.imei} ENTRO al nodo: ${node.name} (Distancia: ${Math.round(distance)}m)`);
                        state.currentNodeId = node.id;
                        state.entryTime = new Date();
                        state.accOffSince = vehicle.accstatus === 0 ? new Date() : null;
                        state.recordedEvent = false;
                    } else {
                        // Ya estaba adentro. Actualizar tracking del motor.
                        if (vehicle.accstatus === 0) {
                            if (!state.accOffSince) state.accOffSince = new Date();
                        } else {
                            // Si prendió el motor, reseteamos el contador de "apagado"
                            state.accOffSince = null;
                        }

                        // Evaluar si cumple las condiciones para ser un "Evento Facturable"
                        if (!state.recordedEvent && state.accOffSince) {
                            const minsOff = (new Date().getTime() - state.accOffSince.getTime()) / 60000;
                            if (minsOff >= node.suggested_dwell_time_mins) {
                                console.log(`💰 [NODO VÁLIDO] Vehículo ${vehicle.imei} cumplió cuota de ${node.suggested_dwell_time_mins} mins en ${node.name}! Insertando en Supabase...`);

                                // Disparar inserción asíncrona a Supabase
                                await supabase.from('oracle_events').insert({
                                    node_id: node.id,
                                    imei: vehicle.imei,
                                    event_type: 'logistica',
                                    time_entered: state.entryTime?.toISOString(),
                                    avg_speed: 0,
                                    engine_status: 0,
                                    is_verified: false
                                });

                                state.recordedEvent = true; // Evitar multiplicidad de eventos por ciclo
                            }
                        }
                    }
                    break; // Un vehículo no puede estar en dos nodos a la vez (asumiendo que no se solapan por completo)
                }
            }

            // Lógica: Saliendo del Nodo
            if (!isInsideAnyNode && state.currentNodeId) {
                console.log(`👋 [EVENTO] Vehículo ${vehicle.imei} SALIO de su nodo anterior. Calculando estadía...`);

                // Si nunca cobramos el evento logístico pero estuvo un rato (ej. tráfico), lo registramos al salir como tráfico
                if (!state.recordedEvent && state.entryTime) {
                    const totalMins = Math.round((new Date().getTime() - state.entryTime.getTime()) / 60000);
                    if (totalMins > 2) { // Minimizar ruido de solo pasar por el borde
                        console.log(`🚦 [TRÁFICO] Vehículo ${vehicle.imei} estuvo ${totalMins} mins en tráfico. Registrando evento...`);
                        await supabase.from('oracle_events').insert({
                            node_id: state.currentNodeId,
                            imei: vehicle.imei,
                            event_type: 'trafico',
                            time_entered: state.entryTime.toISOString(),
                            time_exited: new Date().toISOString(),
                            duration_minutes: totalMins,
                            avg_speed: vehicle.speed,
                            engine_status: vehicle.accstatus,
                            is_verified: false
                        });
                    }
                } else if (state.recordedEvent && state.entryTime) {
                    // Si ya habíamos registrado el inicio del evento logístico (en caliente), aquí lo actualizamos con la salida
                    const totalMins = Math.round((new Date().getTime() - state.entryTime.getTime()) / 60000);

                    await supabase.from('oracle_events')
                        .update({ time_exited: new Date().toISOString(), duration_minutes: totalMins })
                        .eq('imei', vehicle.imei)
                        .eq('node_id', state.currentNodeId)
                        .is('time_exited', null); // Actualizar solo el evento abierto actual
                }

                // Limpiar el estado
                state.currentNodeId = null;
                state.entryTime = null;
                state.accOffSince = null;
                state.recordedEvent = false;
            }
        }

        console.log(`[ORACLE-ENGINE] Ciclo Completado. Esperando próximo pulso.`);

    } catch (error) {
        console.error("[ORACLE-ENGINE] Error Crítico en el Ciclo:", error);
    }
}

// Descomentar para probar:
// runOracleEngine();
