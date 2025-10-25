// src/routes/payments.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const PLATE_RE = /^[A-Z]{3}\d{3}$/;
const r = Router();

r.post("/", async (req: Request, res: Response) => {
  const {
    payer_name,
    plate,
    payment_date,
    amount,
    installment_number,
    proof_url,
    status,
  } = req.body || {};

  if (typeof payer_name !== "string" || !payer_name.trim()) {
    return res.status(400).json({ error: "payer_name required" });
  }

  if (typeof plate !== "string" || !PLATE_RE.test(plate.toUpperCase())) {
    return res.status(400).json({ error: "plate must be ABC123 format" });
  }

  if (typeof payment_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
    return res.status(400).json({ error: "payment_date must be YYYY-MM-DD" });
  }

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  if (
    installment_number != null &&
    !(Number.isInteger(installment_number) && installment_number > 0)
  ) {
    return res.status(400).json({ error: "installment_number must be an integer > 0" });
  }

  if (typeof proof_url !== "string" || !/^https?:\/\//i.test(proof_url)) {
    return res.status(400).json({ error: "proof_url required (upload image first)" });
  }

  // (Opcional) status whitelist
  const allowedStatus = new Set(["pending", "confirmed", "rejected"]);
  const safeStatus = allowedStatus.has(status) ? status : "pending";

  const upperPlate = plate.toUpperCase();

  const { data: v, error: vErr } = await supabase
    .from("vehicles")
    .select("plate")
    .eq("plate", upperPlate)
    .single();

  if (vErr && vErr.code !== "PGRST116") {
    return res.status(500).json({ error: vErr.message });
  }
  if (!v) {
    return res.status(400).json({ error: "unknown plate" });
  }

  const { data, error } = await supabase
    .from("payments")
    .insert([{
      payer_name: payer_name.trim(),
      plate: upperPlate,
      payment_date,
      amount,
      installment_number: installment_number ?? null,
      proof_url: proof_url ?? null,
      status: safeStatus
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

// src/routes/payments.ts (solo el handler GET)
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/** GET /payments?plate=ABC123&limit=10
 * Lista pagos recientes; si llega plate, filtra por esa placa.
 */
r.get("/", async (req: Request, res: Response) => {
  const rawLimit = parseInt(String(req.query.limit || "10"), 10);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 10 : rawLimit, 100));

  const plate = String(req.query.plate || "").toUpperCase().trim();

  let q = supabase
    .from("payments")
    .select("*")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, limit - 1);

  if (plate) {
    q = q.eq("plate", plate);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json(data ?? []);
});

export default r;

