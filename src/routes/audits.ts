import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// ==========================================
// 1. OBTENER REGLAS
// ==========================================
r.get("/rules", async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from("expense_audit_rules")
            .select("*")
            .order("item_name", { ascending: true });

        if (error) throw error;
        return res.json(data || []);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. ACTUALIZAR REGLA MANUALMENTE
// ==========================================
r.put("/rules/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
        item_name,
        category,
        avg_price,
        max_allowed_price,
        expected_frequency_days,
        is_active,
        keywords
    } = req.body;

    try {
        const { data, error } = await supabase
            .from("expense_audit_rules")
            .update({
                item_name,
                category,
                avg_price,
                max_allowed_price,
                expected_frequency_days,
                is_active,
                keywords,
                updated_at: new Date().toISOString()
            })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;
        return res.json(data);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. OBTENER DATOS DEL DASHBOARD DE AUDITORÍA
// ==========================================
r.get("/dashboard", async (req: Request, res: Response) => {
    try {
        // --- A. TOP INSUMOS (DISTRIBUCIÓN DEL DINERO GESTIONADO EN LA DB) ---
        // Dado que Supabase no permite agrupar y sumar fácilmente por JSONB o relaciones complejas, 
        // traeremos los gastos recientes y sumaremos en memoria. Es un approach válido para volúmenes medianos.
        const { data: expenses, error: expErr } = await supabase
            .from("expenses")
            .select("item, total_amount, category")
            // Vamos a analizar el histórico completo o últimos 12 meses
            .gte("date", new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0]);

        if (expErr) throw expErr;

        // Limpieza básica para el top
        const costMap: Record<string, number> = {};
        let totalExpensesSum = 0;

        (expenses || []).forEach(e => {
            const amount = Number(e.total_amount) || 0;
            totalExpensesSum += amount;

            // Reutilizamos la lógica del normalizador estático para que gráficamente tenga sentido
            let name = e.item?.toLowerCase() || '';
            let group = "Otros";

            if (name.includes("llanta") || name.includes("caucho")) group = "Llantas";
            else if (name.includes("aceite") || name.includes("lubricante")) group = "Aceite y Lubricantes";
            else if (name.includes("freno") || name.includes("pastilla") || name.includes("bandas")) group = "Frenos";
            else if (name.includes("bateria")) group = "Baterías";
            else if (name.includes("amortiguador") || name.includes("suspension")) group = "Suspensión";
            else if (name.includes("filtro")) group = "Filtros";
            else if (name.includes("gasolina") || name.includes("combustible")) group = "Combustible";
            else if (name.includes("peaje")) group = "Peajes";
            else if (name.includes("lavado")) group = "Lavados";
            else if (e.category) group = `Otros (${e.category})`;

            costMap[group] = (costMap[group] || 0) + amount;
        });

        // Ordenar el top de insumos
        const topItems = Object.entries(costMap)
            .map(([name, amount]) => ({ name, amount, percentage: Math.round((amount / totalExpensesSum) * 100) || 0 }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10);

        // --- B. TOP VEHÍCULOS "HOYO NEGRO" FINANCIERO (Peor ROI / Más Costosos) ---
        // Sumar gastos agrupados por placa usando la tabla pivot expense_vehicles
        const { data: evData, error: evErr } = await supabase
            .from("expense_vehicles")
            .select("plate, share_amount");

        if (evErr) throw evErr;

        const vehicleMap: Record<string, number> = {};
        (evData || []).forEach(ev => {
            if (!ev.plate) return;
            vehicleMap[ev.plate] = (vehicleMap[ev.plate] || 0) + (Number(ev.share_amount) || 0);
        });

        const worstVehicles = Object.entries(vehicleMap)
            .map(([plate, total_expenses]) => ({ plate, total_expenses }))
            .sort((a, b) => b.total_expenses - a.total_expenses)
            .slice(0, 8); // Top 8 carros más costosos


        // --- C. ALERTAS ACTIVAS ---
        const { data: alerts, error: alertErr } = await supabase
            .from("expense_alerts")
            .select("*, expense_audit_rules(item_name), expenses(date, total_amount)")
            .eq("is_resolved", false)
            .order("created_at", { ascending: false });

        if (alertErr) throw alertErr;

        return res.json({
            summary: {
                total_expenses_year: totalExpensesSum,
                active_alerts_count: alerts?.length || 0
            },
            top_expense_items: topItems,
            worst_roi_vehicles: worstVehicles,
            active_alerts: alerts || []
        });

    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. RESOLVER ALERTA
// ==========================================
r.put("/alerts/:id/resolve", async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from("expense_alerts")
            .update({
                is_resolved: true,
                resolved_at: new Date().toISOString()
            })
            .eq("id", req.params.id)
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, alert: data });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default r;
