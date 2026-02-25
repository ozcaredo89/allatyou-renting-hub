import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || "";

if (!supabaseUrl || !supabaseKey) {
    console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE en el archivo .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// Función de Normalización Simple
// Intenta unificar el texto libre en categorías limpias
// ==========================================
function normalizeItemName(name: string): string {
    let n = name.toLowerCase().trim();
    // Quitar tildes
    n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (n.includes("llanta") || n.includes("caucho")) return "Llantas";
    if (n.includes("aceite") || n.includes("lubricante") || n.includes("oil")) return "Cambio de Aceite";
    if (n.includes("freno") || n.includes("pastilla") || n.includes("bandas")) return "Frenos";
    if (n.includes("bateria")) return "Batería";
    if (n.includes("amortiguador") || n.includes("suspension")) return "Amortiguadores";
    if (n.includes("filtro")) return "Filtros";
    if (n.includes("bujia")) return "Bujías";
    if (n.includes("kit de arrastre") || n.includes("cadena") || n.includes("piñon") || n.includes("pinon")) return "Kit de Arrastre";
    if (n.includes("lavado")) return "Lavado de Vehículo";
    if (n.includes("bombillo") || n.includes("lampara") || n.includes("luz")) return "Luces / Bombillos";
    if (n.includes("parqueadero") || n.includes("estacionamiento")) return "Parqueadero";
    if (n.includes("peaje")) return "Peaje";
    if (n.includes("gasolina") || n.includes("combustible")) return "Combustible";

    // Fallback: Capitalizar la primera letra de cada palabra
    return n.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

async function run() {
    console.log("Obteniendo gastos históricos...");

    let allExpenses: any[] = [];
    let page = 0;
    const pageSize = 1000;

    // Paginar sobre todos los gastos
    while (true) {
        const { data, error } = await supabase
            .from("expenses")
            .select("id, item, category, total_amount, date")
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error("Error obteniendo gastos:", error);
            return;
        }

        if (!data || data.length === 0) break;

        allExpenses = [...allExpenses, ...data];
        page++;
    }

    console.log(`Se encontraron ${allExpenses.length} gastos. Analizando y agrupando...`);

    // Diccionario para contar y promediar
    const groups: Record<string, { count: number, totalAmount: number, category: string, keywords: Set<string> }> = {};

    for (const exp of allExpenses) {
        const normName = normalizeItemName(exp.item);
        if (!groups[normName]) {
            groups[normName] = { count: 0, totalAmount: 0, category: exp.category || 'Mantenimiento', keywords: new Set() };
        }

        groups[normName].count += 1;
        groups[normName].totalAmount += Number(exp.total_amount) || 0;

        // Guardar las palabras clave originales para ayudar al autocompletado después
        const words = exp.item.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        words.forEach((w: string) => groups[normName]!.keywords.add(w.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
    }

    const rulesToInsert = [];

    for (const [name, stats] of Object.entries(groups)) {
        // Solo crear regla si el ítem ha aparecido al menos 2 veces (evitar ruido de cosas únicas)
        if (stats.count >= 2) {
            const avgPrice = stats.totalAmount / stats.count;
            // Por defecto: permitimos un sobrecosto del 25% antes de lanzar alerta roja
            const maxAllowed = avgPrice * 1.25;

            // Frecuencia esperada por defecto (en días)
            let freq = 60; // 2 meses genérico
            if (name === "Llantas") freq = 180; // 6 meses
            if (name === "Batería") freq = 365; // 1 año
            if (name === "Frenos") freq = 90; // 3 meses
            if (name === "Cambio de Aceite") freq = 30; // 1 mes (muy dependiente del uso, pero es una buena base alertar si es menos de 30 días)
            if (name === "Kit de Arrastre") freq = 120; // 4 meses
            if (name === "Lavado de Vehículo") freq = 7; // 1 semana

            rulesToInsert.push({
                item_name: name,
                category: stats.category,
                avg_price: Math.round(avgPrice * 100) / 100, // Redondear a 2 decimales
                max_allowed_price: Math.round(maxAllowed * 100) / 100,
                expected_frequency_days: freq,
                keywords: Array.from(stats.keywords).slice(0, 5), // Guardar max 5 palabras clave de coincidencia
                is_active: true
            });
        }
    }

    console.log(`Se generaron ${rulesToInsert.length} reglas base sólidas. Omitiendo ítems huérfanos...`);

    if (rulesToInsert.length > 0) {
        console.log("Limpiando reglas anteriores...");
        await supabase.from("expense_audit_rules").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // Hack borrar todo

        const { error: insErr } = await supabase
            .from("expense_audit_rules")
            .insert(rulesToInsert);

        if (insErr) {
            console.error("Error insertando reglas en la DB (Verifica que ya corriste la migración SQL):", insErr);
        } else {
            console.log("✅ ¡Éxito! Las reglas iniciales de auditoría han sido sembradas en la base de datos.");
            console.log("Ya puedes consultarlas y modificarlas desde la UI.");
        }
    } else {
        console.log("No se encontraron ítems recurrentes para crear reglas.");
    }
}

run().catch(console.error);
