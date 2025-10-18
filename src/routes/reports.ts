import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /reports/last-payments
 * Query params:
 *  - q: string (filtra por placa o nombre parcial)
 *  - limit: number (default 20)
 *  - offset: number (default 0)
 */
r.get("/last-payments", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || 20), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset || 0), 10) || 0, 0);

  // base query
  let query = supabase
    .from("vehicle_last_payment")
    .select("*", { count: "exact" })
    .order("owner_name", { ascending: true })
    .range(offset, offset + limit - 1);

  // filtro por búsqueda parcial
  if (q) {
    // usamos ilike en plate o owner_name
    // Nota: Supabase JS no compone OR complejas en una sola llamada fácilmente.
    // Hacemos dos pasadas si quisieras precisión; pero aquí basta con una OR simple:
    query = query.or(`plate.ilike.%${q}%,owner_name.ilike.%${q}%`);
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
