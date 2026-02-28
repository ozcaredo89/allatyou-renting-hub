import { supabase } from '../lib/supabase';

/**
 * Módulo de Inteligencia de Negocios (Fase 4 - Scripts de Crecimiento)
 * Busca Nodos (Ej. Zonas Francas, Puertos Secos) que presenten un pico 
 * anómalo de actividad logística (>20% vs semana anterior).
 */
export async function detectMarketOpportunities() {
    console.log("==========================================");
    console.log(`🔍 [BI-MONITOR] Analizando crecimiento semanal de nodos...`);

    try {
        // Consultar la vista SQL que agrupa eventos por semana
        // Traemos las últimas 2 semanas para todos los nodos
        const { data: stats, error } = await supabase
            .from('oracle_weekly_stats')
            .select('*')
            .order('node_id', { ascending: true })
            .order('week_start', { ascending: false });

        if (error) throw new Error("Fallo consultando oracle_weekly_stats: " + error.message);
        if (!stats || stats.length === 0) {
            console.log("[BI-MONITOR] No hay suficientes datos históricos para comparar semanas.");
            return;
        }

        // Agrupar la data por nodo
        const nodesMap = new Map<string, any[]>();
        for (const row of stats) {
            if (!nodesMap.has(row.node_id)) {
                nodesMap.set(row.node_id, []);
            }
            nodesMap.get(row.node_id)!.push(row);
        }

        let alertsGenerated = 0;

        // Comparar Esta Semana (Índice 0) vs Semana Anterior (Índice 1)
        for (const [nodeId, weeks] of Array.from(nodesMap.entries())) {
            if (weeks.length < 2) continue; // Necesitamos al menos 2 semanas de data para comparar

            const thisWeek = weeks[0];
            const lastWeek = weeks[1];

            // Métrica Core: Eventos logísticos validados
            const currentEvents = thisWeek.total_events;
            const previousEvents = lastWeek.total_events;

            // Para evitar ruido estadístico, exigimos un volumen mínimo (ej > 5 eventos/semana)
            if (previousEvents < 5) continue;

            const growthPercentage = ((currentEvents - previousEvents) / previousEvents) * 100;

            if (growthPercentage >= 20) {
                alertsGenerated++;

                console.log(`\n🚨 OPORTUNIDAD DE MERCADO DETECTADA (NODO: ${thisWeek.node_name}) 🚨`);
                console.log(`   - Categoría: ${thisWeek.category}`);
                console.log(`   - Volumen Semana Pasada: ${previousEvents} operaciones.`);
                console.log(`   - Volumen Esta Semana: ${currentEvents} operaciones.`);
                console.log(`   - Crecimiento: +${growthPercentage.toFixed(1)}% 🚀`);

                // Aquí podrías enviar un Webhook a Slack, Email, o a un CRM de ventas:
                // sendSlackAlert(thisWeek.node_name, growthPercentage);
            }
        }

        if (alertsGenerated === 0) {
            console.log("[BI-MONITOR] Todo el flujo parece normal. Ningún nodo creció > 20% esta semana.");
        } else {
            console.log(`\n[BI-MONITOR] Reporte listo. ${alertsGenerated} Alertas generadas.`);
        }

    } catch (err: any) {
        console.error("[BI-MONITOR] Error en el análisis de BI:", err.message);
    }
}

// Descomentar para ejecutar unitariamente o en un CRON Job de fin de semana
// detectMarketOpportunities();
