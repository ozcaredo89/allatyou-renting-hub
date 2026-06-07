import { runOracleEngine } from './engine';
import { detectMarketOpportunities } from './monitor';
import { startMonetizationApi } from './api';
import { supabase } from '../lib/supabase';

// Este script convierte el motor estático del Oráculo en un verdadero Daemon
// que extrae la posición de los vehículos, roba el token, y calcula los eventos constantemente.

const POLLING_INTERVAL_MINS = 3;

// --------------------------------------------------------
// Nightly hotspot recalculation scheduler
// Runs the PostGIS DBSCAN clustering RPC once per day at
// approximately 03:00 AM local server time (low-traffic window).
// --------------------------------------------------------
let _hotspotJobLastRunDate: string | null = null;

function scheduleNightlyHotspotJob() {
    // Check every 5 minutes whether it's time to run the nightly job.
    setInterval(async () => {
        const now = new Date();
        const hour = now.getHours();
        const today = now.toISOString().slice(0, 10); // "YYYY-MM-DD"

        // Fire at 03:xx AM and only once per calendar day
        if (hour === 3 && _hotspotJobLastRunDate !== today) {
            _hotspotJobLastRunDate = today;
            console.log("[ORACLE-HOTSPOT] 🗺️  Iniciando recalculo de Top Locations (PostGIS DBSCAN)...");
            try {
                const { error } = await supabase.rpc('calculate_fleet_top_locations');
                if (error) {
                    console.error("[ORACLE-HOTSPOT] RPC error:", error.message);
                } else {
                    console.log("[ORACLE-HOTSPOT] ✅ Top Locations actualizados exitosamente.");
                }
            } catch (err: any) {
                console.error("[ORACLE-HOTSPOT] CRITICAL: fallo en el job nocturno:", err.message);
            }
        }
    }, 5 * 60 * 1000); // Poll every 5 minutes
}

export async function startOracleDaemon() {
    console.log("==========================================");
    console.log(`👁️ EL ORÁCULO DE NODOS HA DESPERTADO`);
    console.log(`==========================================`);
    console.log(`Frecuencia de Ingesta: Cada ${POLLING_INTERVAL_MINS} minutos.`);
    console.log("Presiona Ctrl+C para detener el proceso.");

    // Ejecutar el primer ciclo del motor geoespacial
    await runOracleEngine();

    // Ejecutar el monitor de oportunidades de mercado (1 vez al inicio y luego diario)
    await detectMarketOpportunities();

    // Levantar el servidor HTTP para los clientes DaaS
    startMonetizationApi();

    // Entrar en el loop infinito de ingestión (cada 3 mins)
    setInterval(async () => {
        try {
            await runOracleEngine();
        } catch (e: any) {
            console.error("[DAEMON CRASH] El Oráculo falló este ciclo, reintentando el próximo...", e.message);
        }
    }, POLLING_INTERVAL_MINS * 60 * 1000);

    // Monitor de Alertas de Mercado (Diario)
    setInterval(async () => {
        try {
            await detectMarketOpportunities();
        } catch (e: any) {
            console.error("[DAEMON CRASH] Fallo en el BI Monitor:", e.message);
        }
    }, 24 * 60 * 60 * 1000); // 24 Horas

    // Nightly GPS Hotspot clustering job (runs at 03:00 AM every day)
    scheduleNightlyHotspotJob();
    console.log("[ORACLE-HOTSPOT] 🕒 Job nocturno de Top Locations registrado (disparo a las 03:00 AM).");
}

