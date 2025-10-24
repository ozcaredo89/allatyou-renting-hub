import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /ledger?plate=ABC123&month=YYYY-MM
 * Lista ajustes del mes. Si falta month, devuelve últimos 30 días.
 */
r.get("/", async (req: Request, res: Response) => {
  // Fuerza string siempre (nunca undefined)
  const plate: string = (typeof req.query.plate === "string" ? req.query.plate : "")
    .toUpperCase()
    .trim();

  const month: string = (typeof req.query.month === "string" ? req.query.month : "").trim();

  let q = supabase
    .from("vehicle_ledger")
    .select("*")
    .order("date", { ascending: false });

  if (plate.length > 0) {
    q = q.eq("plate", plate); // plate es string garantizado
  }

  if (month.length > 0) {
    // Validar formato YYYY-MM
    const mMatch = month.match(/^(\d{4})-(\d{2})$/);
    if (!mMatch) {
      return res.status(400).json({ error: "invalid month (YYYY-MM)" });
    }
    const y = Number(mMatch[1]);
    const m0 = Number(mMatch[2]) - 1; // 0..11
    if (!Number.isFinite(y) || !Number.isFinite(m0) || m0 < 0 || m0 > 11) {
      return res.status(400).json({ error: "invalid month (YYYY-MM)" });
    }

    const startISO: string = `${month}-01`; // inclusive
    const endISO: string = new Date(Date.UTC(y, m0 + 1, 1)) // primer día del mes siguiente (exclusive)
      .toISOString()
      .slice(0, 10);

    q = q.gte("date", startISO).lt("date", endISO); // ambas son string estrictamente
  } else {
    // últimos 30 días
    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const startISO = start.toISOString().slice(0, 10);
    const endISO = end.toISOString().slice(0, 10);
    q = q.gte("date", startISO).lte("date", endISO);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data ?? [] });
});

/**
 * POST /ledger
 * { plate, date, type, amount, description?, attachment_url? }
 */
r.post("/", async (req: Request, res: Response) => {
  const { plate, date, type, amount, description, attachment_url } = req.body || {};
  if (!plate || !/^[A-Z0-9]{6}$/.test(String(plate).toUpperCase()))
    return res.status(400).json({ error: "valid plate required (ABC123)" });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  if (!type) return res.status(400).json({ error: "type required" });
  if (typeof amount !== "number" || !isFinite(amount))
    return res.status(400).json({ error: "amount must be number" });

  const row = {
    plate: String(plate).toUpperCase().trim(),
    date,
    type,
    amount,
    description: description?.trim() || null,
    attachment_url: attachment_url || null,
  };

  const { data, error } = await supabase.from("vehicle_ledger").insert([row]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

/**
 * PUT /ledger/:id
 * { date?, type?, amount?, description?, attachment_url? }
 */
r.put("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { date, type, amount, description, attachment_url } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });

  const patch: any = { updated_at: new Date().toISOString() };
  if (date) patch.date = date;
  if (type) patch.type = type;
  if (typeof amount === "number") patch.amount = amount;
  if (description !== undefined) patch.description = description?.trim() || null;
  if (attachment_url !== undefined) patch.attachment_url = attachment_url || null;

  const { data, error } = await supabase.from("vehicle_ledger").update(patch).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** DELETE /ledger/:id */
r.delete("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id required" });

  const { error } = await supabase.from("vehicle_ledger").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default r;
