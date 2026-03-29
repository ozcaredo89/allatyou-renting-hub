// src/routes/inventory.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Infers the expense category from the inventory item category */
function inferExpenseCategory(inventoryCategory: string): string {
  const lower = inventoryCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (lower.includes("aceite") || lower.includes("lubricante")) return "Cambio de aceite";
  return "Mantenimiento";
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY ITEMS (CATÁLOGO)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /inventory/items — Listar todos los ítems del catálogo */
r.get("/items", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data ?? []);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

/** POST /inventory/items — Crear un nuevo ítem en el catálogo */
r.post("/items", async (req: Request, res: Response) => {
  try {
    const { category, name, unit_cost, sale_price, current_stock } = req.body || {};

    if (!category || typeof category !== "string" || !category.trim())
      return res.status(400).json({ error: "category is required" });
    if (!name || typeof name !== "string" || !name.trim())
      return res.status(400).json({ error: "name is required" });
    if (typeof unit_cost !== "number" || unit_cost < 0)
      return res.status(400).json({ error: "unit_cost must be a non-negative number" });
    if (typeof sale_price !== "number" || sale_price < 0)
      return res.status(400).json({ error: "sale_price must be a non-negative number" });

    const { data, error } = await supabase
      .from("inventory_items")
      .insert([{
        category: category.trim(),
        name: name.trim(),
        unit_cost,
        sale_price,
        current_stock: typeof current_stock === "number" ? current_stock : 0
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

/** PUT /inventory/items/:id — Actualizar un ítem del catálogo */
r.put("/items/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

    const { category, name, unit_cost, sale_price } = req.body || {};
    const updates: Record<string, any> = {};

    if (category && typeof category === "string") updates.category = category.trim();
    if (name && typeof name === "string") updates.name = name.trim();
    if (typeof unit_cost === "number" && unit_cost >= 0) updates.unit_cost = unit_cost;
    if (typeof sale_price === "number" && sale_price >= 0) updates.sale_price = sale_price;

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: "No valid fields to update" });

    const { data, error } = await supabase
      .from("inventory_items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

/** DELETE /inventory/items/:id — Eliminar un ítem del catálogo */
r.delete("/items/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY MOVEMENTS (HISTORIAL TRANSACCIONAL)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /inventory/movements — Listar movimientos con info del ítem */
r.get("/movements", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || 50), 10) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset || 0), 10) || 0, 0);

    const { data, error, count } = await supabase
      .from("inventory_movements")
      .select("*, inventory_items(name, category, unit_cost)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ items: data ?? [], total: count ?? 0, limit, offset });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

/**
 * POST /inventory/movements — Registrar un movimiento de inventario.
 *
 * REGLA DE NEGOCIO CRÍTICA:
 * Si movement_type === 'OUT_FLOTA' y trae vehicle_plate,
 * se crea automáticamente un gasto en la tabla `expenses`
 * y su relación en `expense_vehicles`.
 */
r.post("/movements", async (req: Request, res: Response) => {
  try {
    const { item_id, movement_type, quantity, vehicle_plate } = req.body || {};

    // Validaciones
    if (!item_id || !Number.isFinite(Number(item_id)))
      return res.status(400).json({ error: "item_id is required and must be a number" });
    if (!["IN", "OUT_FLOTA", "OUT_SALE"].includes(movement_type))
      return res.status(400).json({ error: "movement_type must be IN, OUT_FLOTA or OUT_SALE" });
    if (!quantity || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0)
      return res.status(400).json({ error: "quantity must be a positive number" });
    if (movement_type === "OUT_FLOTA" && (!vehicle_plate || typeof vehicle_plate !== "string" || !vehicle_plate.trim()))
      return res.status(400).json({ error: "vehicle_plate is required for OUT_FLOTA movements" });

    const itemId = Number(item_id);
    const qty = Number(quantity);
    const plate = vehicle_plate ? String(vehicle_plate).toUpperCase().trim() : null;

    // Obtener el ítem para calcular el valor total
    const { data: itemData, error: itemErr } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (itemErr || !itemData)
      return res.status(404).json({ error: "Item not found" });

    // Verificar stock suficiente para salidas
    if ((movement_type === "OUT_FLOTA" || movement_type === "OUT_SALE") && itemData.current_stock < qty)
      return res.status(400).json({ error: `Stock insuficiente. Stock actual: ${itemData.current_stock}, solicitado: ${qty}` });

    // Calcular valor total del movimiento
    // - OUT_SALE usa sale_price (venta al cliente)
    // - IN y OUT_FLOTA usan unit_cost (costo interno)
    const unitPrice = movement_type === "OUT_SALE" ? Number(itemData.sale_price) : Number(itemData.unit_cost);
    const totalValue = Number((unitPrice * qty).toFixed(2));

    // Insertar el movimiento (el trigger de DB actualizará current_stock automáticamente)
    const { data: movement, error: movErr } = await supabase
      .from("inventory_movements")
      .insert([{
        item_id: itemId,
        movement_type,
        quantity: qty,
        vehicle_plate: plate,
        total_value: totalValue
      }])
      .select()
      .single();

    if (movErr || !movement)
      return res.status(500).json({ error: movErr?.message || "Error inserting movement" });

    // ─── INTEGRACIÓN FINANCIERA CRÍTICA ──────────────────────────────────────
    // Si es una salida a flota con placa, crear el gasto automáticamente
    let createdExpense = null;
    if (movement_type === "OUT_FLOTA" && plate) {
      const expenseItem = `Repuesto/Aceite: ${itemData.name}`;
      const expenseCategory = inferExpenseCategory(itemData.category);
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // 1. Insertar en expenses
      const { data: expense, error: expErr } = await supabase
        .from("expenses")
        .insert([{
          date: today,
          item: expenseItem,
          category: expenseCategory,
          description: `Consumo de inventario: ${qty} x ${itemData.name} (Placa: ${plate})`,
          total_amount: totalValue
        }])
        .select()
        .single();

      if (expErr || !expense) {
        // No revertimos el movimiento pero sí informamos del problema parcial
        console.error("[Inventory] Error creando gasto automático:", expErr?.message);
        return res.status(201).json({
          movement,
          expense: null,
          warning: "Movimiento registrado pero hubo un error creando el gasto automático: " + expErr?.message
        });
      }

      // 2. Insertar en expense_vehicles (100% del share_amount a esa placa)
      const { error: evErr } = await supabase
        .from("expense_vehicles")
        .insert([{
          expense_id: expense.id,
          plate,
          share_amount: totalValue
        }]);

      if (evErr) {
        console.error("[Inventory] Error asociando gasto al vehículo:", evErr.message);
      }

      // 3. Log de auditoría (asíncrono, no bloquea)
      // Usamos Promise.resolve() porque el cliente de Supabase devuelve PromiseLike<void>
      // (sin .select()) y TypeScript no encuentra .catch() directamente en ese tipo.
      Promise.resolve(
        supabase.from("expense_audit_log").insert([{
          expense_id: expense.id,
          action: "created",
          changed_fields: {
            source: "inventory_movement",
            movement_id: movement.id,
            plates: [plate],
            category: expenseCategory
          },
          actor: "sistema-inventario"
        }])
      ).catch((e: any) => console.error("[Inventory] Audit log error:", e));

      createdExpense = expense;
    }
    // ─────────────────────────────────────────────────────────────────────────

    return res.status(201).json({ movement, expense: createdExpense });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

export default r;
