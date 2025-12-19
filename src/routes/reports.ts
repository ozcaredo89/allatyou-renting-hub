import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

const MAX_LIMIT = 1000;

r.get("/last-payments", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();

  const rawLimit = parseInt(String(req.query.limit ?? 20), 10);
  const rawOffset = parseInt(String(req.query.offset ?? 0), 10);

  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), MAX_LIMIT);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const overdueOnly = String(req.query.overdue_only || "false") === "true";

  let query = supabase
    .from("vehicle_last_payment")
    .select("*", { count: "exact" })
    .order("is_overdue", { ascending: false })
    .order("owner_name", { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1);

  if (q) {
    const safeQ = q.replace(/[%_,]/g, "\\$&"); // opcional: evita comodines accidentales
    query = query.or(`plate.ilike.%${safeQ}%,owner_name.ilike.%${safeQ}%`);
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
    offset,
  });
});

export default r;
