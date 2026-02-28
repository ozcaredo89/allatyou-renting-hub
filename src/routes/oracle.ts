import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// ==========================================
// 1. OBTENER KPI GLOBALES (Nodos Activos y Eventos Recientes)
// ==========================================
r.get("/kpis", async (req: Request, res: Response) => {
    try {
        // Contar nodos activos
        const { count: activeNodes } = await supabase
            .from("oracle_nodes")
            .select('*', { count: 'exact', head: true })
            .eq("is_active", true);

        // Contar eventos logísticos en las últimas 24 hrs
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: liveOperations } = await supabase
            .from("oracle_events")
            .select('*', { count: 'exact', head: true })
            .gte("created_at", yesterday);

        return res.json({
            activeNodes: activeNodes || 0,
            liveOperations: liveOperations || 0,
            marketGrowthPct: 0 // Placeholder calculation for week over week
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. RANKING DE CALOR (Top Nodos de la Semana)
// ==========================================
r.get("/ranking", async (req: Request, res: Response) => {
    try {
        // Intentar leer la Vista Materializada/Lógica que creamos
        const { data, error } = await supabase
            .from("oracle_weekly_stats")
            .select("*")
            .order("total_events", { ascending: false })
            .limit(20);

        if (error) {
            console.error("Error reading weekly view:", error.message);
            // Fallback: Si la vista falla, hacemos query bruto a oracle_nodes
            const { data: nodes } = await supabase.from("oracle_nodes").select("*").eq("is_active", true);
            return res.json(nodes || []);
        }

        return res.json(data || []);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. LIVE FEED (Línea de Vida - Últimos Eventos)
// ==========================================
r.get("/live-feed", async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from("oracle_events")
            .select(`
                *,
                oracle_nodes(name, category)
            `)
            .order("entry_time", { ascending: false })
            .limit(10);

        if (error) throw error;
        return res.json(data || []);
    } catch (err: any) {
        console.error("Error en /oracle/live-feed:", err);
        res.status(500).json({ error: "No se pudo obtener el feed en vivo." });
    }
});

// ============================================================================
// 4. NODOS ORGÁNICOS (Data Lake Clustering) - (Fase 4 Pivot)
// ============================================================================
r.get("/organic-hotspots", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("organic_hotspots_view")
            .select("*")
            .limit(10); // Traemos el Top 10 de lugares donde más convergen orgánicamente 

        if (error) throw error;

        res.json(data);
    } catch (err: any) {
        console.error("Error en /oracle/organic-hotspots:", err);
        res.status(500).json({ error: "No se pudieron calcular los clústeres orgánicos." });
    }
});

export default r;
