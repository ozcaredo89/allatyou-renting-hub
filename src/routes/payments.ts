// src/routes/payments.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// Crear pago
r.post("/", async (req: Request, res: Response) => {
  const { payer_name, plate, payment_date, amount, installment_number, proof_url, status } = req.body || {};

  if (typeof payer_name !== "string" || !payer_name.trim())
    return res.status(400).json({ error: "payer_name required" });
  if (typeof plate !== "string" || !plate.trim())
    return res.status(400).json({ error: "plate required" });
  if (typeof payment_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date))
    return res.status(400).json({ error: "payment_date must be YYYY-MM-DD" });
  if (typeof amount !== "number" || !isFinite(amount) || amount < 0)
    return res.status(400).json({ error: "amount must be a positive number" });

  const { data, error } = await supabase
    .from("payments")
    .insert([{
      payer_name,
      plate,
      payment_date,
      amount,
      installment_number: installment_number ?? null,
      proof_url: proof_url ?? null,
      status: status ?? "pending"
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

// Listar
r.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default r;
