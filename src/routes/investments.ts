import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// GET /investments?plate=ABC123
r.get("/", async (req: Request, res: Response) => {
  const plate = String(req.query.plate || "").toUpperCase().trim();

  let q = supabase.from("vehicle_investments").select("*").order("plate");
  if (plate) q = q.eq("plate", plate);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data ?? [] });
});

// POST /investments  { plate, amount, note? }
r.post("/", async (req: Request, res: Response) => {
  const { plate, amount, note } = req.body || {};
  if (!plate || typeof amount !== "number") {
    return res.status(400).json({ error: "plate and amount are required" });
  }

  const { data, error } = await supabase
    .from("vehicle_investments")
    .upsert([{ plate: String(plate).toUpperCase().trim(), amount, note: note ?? null }], {
      onConflict: "plate",
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /investments/:plate  { amount, note? }
r.put("/:plate", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase().trim();
  const { amount, note } = req.body || {};
  if (!plate || typeof amount !== "number") {
    return res.status(400).json({ error: "amount required" });
  }

  const { data, error } = await supabase
    .from("vehicle_investments")
    .update({ amount, note: note ?? null, updated_at: new Date().toISOString() })
    .eq("plate", plate)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /investments/:plate
r.delete("/:plate", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase().trim();
  if (!plate) return res.status(400).json({ error: "plate required" });

  const { error } = await supabase.from("vehicle_investments").delete().eq("plate", plate);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default r;
