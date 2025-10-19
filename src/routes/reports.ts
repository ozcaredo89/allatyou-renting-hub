import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /reports/last-payments
 * Query params:
 *  - q: string (filtra por placa o nombre parcial)
 *  - limit: number (default 20)
 *  - offset: number (default 0)
 *  - overdue_only: "true" | "false" (solo en mora)
 */
r.get("/last-payments", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || 20), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset || 0), 10) || 0, 0);
  const overdueOnly = String(req.query.overdue_only || "false") === "true";

  let query = supabase
    .from("vehicle_last_payment")
    .select("*", { count: "exact" })
    .order("is_overdue", { ascending: false })                // morosos primero
    .order("owner_name", { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(`plate.ilike.%${q}%,owner_name.ilike.%${q}%`);
  }

  if (overdueOnly) {
    query = query.eq("is_overdue", true);
  }

  const { data, error, count } = await query;

  if (error) return res.status(500).json({ error: error.message });
  return res.json({
    items: data ?? [],
    total: count ?? 0,
    limit,
    offset
  });
});

export default r;
