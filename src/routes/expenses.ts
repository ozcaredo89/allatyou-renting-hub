// src/routes/expenses.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const PLATE_RE = /^[A-Z]{3}\d{3}$/;
const r = Router();

/** Util: prorrateo exacto en centavos */
function splitEven(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const rem  = totalCents % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** POST /expenses
 * body: { date, item, description, total_amount, plates: string[], attachment_url? }
 */
r.post("/", async (req: Request, res: Response) => {
  try {
    const { date, item, description, total_amount, plates, attachment_url } = req.body || {};

    // Validaciones básicas
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });

    if (typeof item !== "string" || !item.trim())
      return res.status(400).json({ error: "item required" });

    if (typeof description !== "string" || !description.trim())
      return res.status(400).json({ error: "description required" });

    if (typeof total_amount !== "number" || !isFinite(total_amount) || total_amount <= 0)
      return res.status(400).json({ error: "total_amount must be > 0" });

    if (!Array.isArray(plates) || plates.length === 0)
      return res.status(400).json({ error: "plates must be non-empty array" });

    // Normaliza y valida formato
    const normPlates = Array.from(new Set(
      plates.map((p: unknown) => String(p || "").toUpperCase().trim())
    ));
    if (normPlates.some(p => !PLATE_RE.test(p)))
      return res.status(400).json({ error: "all plates must match ABC123 format" });

    // Verifica que existan en vehicles
    const { data: vdata, error: vErr } = await supabase
      .from("vehicles")
      .select("plate")
      .in("plate", normPlates);

    if (vErr) return res.status(500).json({ error: vErr.message });
    const found = new Set((vdata || []).map(r => r.plate));
    const missing = normPlates.filter(p => !found.has(p));
    if (missing.length) return res.status(400).json({ error: "unknown plates", missing });

    // Prorrateo
    const totalCents = Math.round(total_amount * 100);
    const cents      = splitEven(totalCents, normPlates.length);
    const shares     = cents.map(c => Number((c / 100).toFixed(2))); // a COP con 2 decimales

    // Inserta expense
    const { data: exp, error: eErr } = await supabase
      .from("expenses")
      .insert([{
        date,
        item: item.trim(),
        description: description.trim(),
        total_amount: Number(total_amount.toFixed(2)),
        attachment_url: attachment_url ?? null
      }])
      .select()
      .single();

    if (eErr) return res.status(500).json({ error: eErr.message });

    const rows = normPlates.map((plate, i) => ({
      expense_id: exp.id,
      plate,
      share_amount: shares[i]
    }));

    const { error: dErr } = await supabase.from("expense_vehicles").insert(rows);
    if (dErr) return res.status(500).json({ error: dErr.message });

    await supabase.from("expense_audit_log").insert([{
      expense_id: exp.id,
      action: "created",
      changed_fields: { plates: normPlates, shares },
      actor: null
    }]);

    return res.status(201).json({ expense: exp, detail: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

/** GET /expenses?plate=&from=&to=&limit=&offset=
 * Devuelve gastos (maestro) + detalle cuando hay filtro plate.
 */
r.get("/", async (req: Request, res: Response) => {
  const limit  = Math.min(Math.max(parseInt(String(req.query.limit || 20), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset || 0), 10) || 0, 0);
  const from   = String(req.query.from || "");
  const to     = String(req.query.to   || "");
  const plate  = String(req.query.plate || "").toUpperCase().trim();

  // base: expenses
  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) query = query.gte("date", from);
  if (to)   query = query.lte("date", to);

  // Si se filtra por placa, haz join con expense_vehicles
  if (plate) {
    query = supabase
      .from("expenses")
      .select("*, expense_vehicles!inner(plate, share_amount)", { count: "exact" })
      .eq("expense_vehicles.plate", plate)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (from) query = query.gte("date", from);
    if (to)   query = query.lte("date", to);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data ?? [], total: count ?? 0, limit, offset });
});

/** PUT /expenses/:id/attachment  (opcional: agregar/actualizar soporte) */
r.put("/:id/attachment", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { attachment_url } = req.body || {};
  if (!id || typeof attachment_url !== "string")
    return res.status(400).json({ error: "id and attachment_url required" });

  // Lee actual (para log)
  const { data: prev, error: gErr } = await supabase.from("expenses").select("attachment_url").eq("id", id).single();
  if (gErr) return res.status(500).json({ error: gErr.message });

  const { data, error } = await supabase
    .from("expenses")
    .update({ attachment_url, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("expense_audit_log").insert([{
    expense_id: id,
    action: "attachment_added",
    changed_fields: { attachment_url: { old: prev?.attachment_url ?? null, new: attachment_url } },
    actor: null
  }]);

  res.json(data);
});

export default r;
