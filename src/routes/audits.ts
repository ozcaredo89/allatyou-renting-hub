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

// ==========================================
// 5. ANALIZAR INPUT DE GASTO (ASISTENCIA UI)
// ==========================================
r.post("/analyze-input", async (req: Request, res: Response) => {
    const { item, plates } = req.body;
    if (!item || !plates || !plates.length) return res.json({ suggestion: null });

    try {
        // 1. Buscar regla activa que coincida con el nombre
        const { data: rules } = await supabase.from("expense_audit_rules").select("*").eq("is_active", true);
        if (!rules) return res.json({ suggestion: null });

        let normItem = item.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const matchedRule = rules.find(r => {
            let rName = r.item_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (normItem.includes(rName)) return true;
            if (r.keywords && Array.isArray(r.keywords)) {
                return r.keywords.some((kw: string) => normItem.includes(kw));
            }
            return false;
        });

        if (!matchedRule) return res.json({ suggestion: null });

        // 2. Si hay regla, buscar el último cambio para cada placa para la advertencia de frecuencia
        let lastChanges: Record<string, number> = {}; // plate -> days ago
        let freqWarning = false;

        if (matchedRule.expected_frequency_days) {
            for (const plate of plates) {
                // Buscamos manual en DB. Importante: usamos ilike con el item_name base de la regla
                const { data: priorExpenses } = await supabase
                    .from("expenses")
                    .select("date, expense_vehicles!inner(plate)")
                    .eq("expense_vehicles.plate", plate)
                    .ilike("item", `%${matchedRule.item_name}%`)
                    .order("date", { ascending: false })
                    .limit(1);

                if (priorExpenses && priorExpenses.length > 0) {
                    const lastDate = new Date((priorExpenses as any)[0].date);
                    const diffDays = Math.floor((new Date().getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
                    lastChanges[plate] = diffDays;
                    if (diffDays < matchedRule.expected_frequency_days) {
                        freqWarning = true;
                    }
                }
            }
        }

        return res.json({
            suggestion: {
                rule_id: matchedRule.id,
                item_name: matchedRule.item_name,
                max_allowed_price: matchedRule.max_allowed_price,
                expected_frequency_days: matchedRule.expected_frequency_days,
                last_changes: lastChanges,
                freq_warning: freqWarning
            }
        });

    } catch (err: any) {
        console.error("Error analyze-input:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 6. OBTENER ITEMS HISTÓRICOS (FASE 3)
// ==========================================
r.get("/historical-items", async (req: Request, res: Response) => {
    try {
        // Obtenemos todos los ítems de las reglas de auditoría primero
        const { data: rules, error: rulesErr } = await supabase
            .from("expense_audit_rules")
            .select("item_name, max_allowed_price, avg_price, category")
            .eq("is_active", true);

        if (rulesErr) throw rulesErr;

        // Formateamos como mapa para que la lista sea única
        const itemsMap = new Map<string, any>();
        (rules || []).forEach(r => {
            itemsMap.set(r.item_name.toLowerCase().trim(), {
                id: `rule-${r.item_name}`,
                item_name: r.item_name,
                category: r.category || 'Otros',
                max_allowed_price: r.max_allowed_price,
                avg_price: r.avg_price,
                is_rule: true
            });
        });

        // Ahora sacamos los históricos únicos puros desde la tabla expenses
        // Agruparemos en JS ya que el endpoint base puede ser pesado, limitamos a la ventana útil de 1 año
        const oneYearAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0];

        const { data: expenses, error: expErr } = await supabase
            .from("expenses")
            .select("item, category, total_amount")
            .gte("date", oneYearAgo);

        if (expErr) throw expErr;

        (expenses || []).forEach(e => {
            const rawName = (e.item || "").trim();
            if (!rawName) return;
            const key = rawName.toLowerCase();

            // Si ya existe por la regla, lo saltamos
            if (itemsMap.has(key)) return;

            // Conservamos el item en el mapa marcándolo como NO regla
            itemsMap.set(key, {
                id: `hist-${rawName}`,
                item_name: rawName,
                category: e.category || 'Otros',
                max_allowed_price: null,
                avg_price: Number(e.total_amount),
                is_rule: false
            });
        });

        // Convertimos el map a array y devolvemos ordenado alfabéticamente
        const combinedItems = Array.from(itemsMap.values()).sort((a, b) => a.item_name.localeCompare(b.item_name));

        return res.json(combinedItems);
    } catch (err: any) {
        console.error("Error fetching historical items:", err);
        return res.status(500).json({ error: err.message });
    }
});

export default r;
