import { runOracleEngine } from './engine';
import { detectMarketOpportunities } from './monitor';
import { startMonetizationApi } from './api';

// Este script convierte el motor estático del Oráculo en un verdadero Daemon
// que extrae la posición de los vehículos, roba el token, y calcula los eventos constantemente.

const POLLING_INTERVAL_MINS = 3;

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
}
