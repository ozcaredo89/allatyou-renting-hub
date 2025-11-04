// src/routes/advances.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { buildFixedSchedule  } from "../lib/amort";

const r = Router();

// --- Utils/validations ---
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

async function plateExists(plate?: string): Promise<boolean> {
  if (!plate) return true;
  if (!PLATE_RE.test(plate)) return false;
  const { data, error } = await supabase
    .from("vehicles")
    .select("plate")
    .eq("plate", plate)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function driverExists(driver_id?: number): Promise<boolean> {
  if (!driver_id) return true;
  const { data, error } = await supabase
    .from("drivers")
    .select("id")
    .eq("id", driver_id)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

// --------- POST /advances : crea el préstamo y genera cronograma ----------
/**
 * Body:
 * { person_name, person_type ('driver'|'collaborator'),
 *   driver_id?, plate?, amount (COP), rate_percent=15, installments=21,
 *   start_date=YYYY-MM-DD, notes? }
 */
r.post("/", async (req: Request, res: Response) => {
  try {
    const {
      person_name,
      person_type,
      driver_id,
      plate,
      amount,
      rate_percent = 15.0,
      installments = 21,
      start_date,
      notes,
    } = req.body || {};

    const daily_installment = Number(req.body?.daily_installment);

    // Validaciones básicas
    if (!person_name || typeof person_name !== "string") {
      return res.status(400).json({ error: "person_name required" });
    }
    if (!["driver", "collaborator"].includes(person_type)) {
      return res.status(400).json({ error: "person_type must be 'driver'|'collaborator'" });
    }
    if (!(Number(amount) > 0)) {
      return res.status(400).json({ error: "amount > 0 required" });
    }
    if (!(Number(rate_percent) >= 0)) {
      return res.status(400).json({ error: "rate_percent >= 0 required" });
    }
    if (!(Number(installments) >= 1)) {
      return res.status(400).json({ error: "installments >= 1 required" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start_date))) {
      return res.status(400).json({ error: "start_date must be YYYY-MM-DD" });
    }
    if (!(daily_installment > 0)) {
    return res.status(400).json({ error: "daily_installment > 0 required" });
    }

    // Validar existencia de placa/driver si vienen
    if (!(await plateExists(plate))) {
      return res.status(400).json({ error: "plate not found or invalid" });
    }
    if (!(await driverExists(driver_id))) {
      return res.status(400).json({ error: "driver_id not found" });
    }

    // 1) Crear el advance
    const { data: advIns, error: advErr } = await supabase
      .from("operational_advances")
      .insert({
        person_name,
        person_type,
        driver_id: driver_id ?? null,
        plate: plate ?? null,
        amount: Math.round(Number(amount)),
        rate_percent: Number(rate_percent),
        installments: Number(installments),
        start_date: String(start_date),
        status: "active",
        notes: notes ?? null,
        daily_installment: Math.round(daily_installment),
      })
      .select("*")
      .single();

    if (advErr || !advIns) {
      return res.status(500).json({ error: advErr?.message || "insert advance failed" });
    }

    // 2) Generar cronograma francés (tasa mensual rate_percent)
    const schedule = buildFixedSchedule(
      advIns.amount,
      advIns.installments,
      advIns.start_date,
      { rateType: 'total', totalRatePercent: advIns.rate_percent, firstDueAtStart: false }
    );

    const schRows = schedule.map(s => ({
      advance_id: advIns.id,
      installment_no: s.installment_no,
      due_date: s.due_date,
      installment_amount: s.installment_amount,
      interest_amount: s.interest_amount,
      principal_amount: s.principal_amount,
      status: "pending",
    }));

    const { error: schErr } = await supabase
      .from("operational_advance_schedule")
      .insert(schRows);

    if (schErr) {
      // rollback “manual”: borrar advance si falla cronograma
      await supabase.from("operational_advances").delete().eq("id", advIns.id);
      return res.status(500).json({ error: schErr.message });
    }

    return res.json({ advance: advIns });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "internal error" });
  }
});

// --------- GET /advances?status&person&plate -------------
r.get("/", async (req: Request, res: Response) => {
  const { status, person, plate, limit = "50", offset = "0" } = req.query as Record<string, string>;

  let q = supabase
    .from("operational_advances")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);
  if (plate)  q = q.eq("plate", plate.toUpperCase());
  if (person) q = q.ilike("person_name", `%${person}%`);

  const lim = Math.max(1, Math.min(200, parseInt(limit)));
  const off = Math.max(0, parseInt(offset));

  q = q.range(off, off + lim - 1);

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: data ?? [], total: count ?? 0 });
});

// --------- GET /advances/:id/schedule --------------------
r.get("/:id/schedule", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const { data: sch, error } = await supabase
    .from("operational_advance_schedule")
    .select("*")
    .eq("advance_id", id)
    .order("installment_no", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const today = new Date().toISOString().slice(0, 10);
  const withOverdue = (sch ?? []).map(row => {
    const isPaid = row.status === "paid";
    const overdue = !isPaid && row.due_date < today;
    return { ...row, overdue };
  });

  res.json({ items: withOverdue });
});

// --------- POST /advances/:id/payments -------------------
/**
 * Body: { installment_no, paid_date?, amount? }
 * - Marca la cuota como pagada (paid) con paid_date
 * - Inserta ledger "advance_repayment" (positivo)
 */
r.post("/:id/payments", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const { installment_no, paid_date, amount } = req.body || {};
  if (!(Number(installment_no) >= 1)) {
    return res.status(400).json({ error: "installment_no >= 1 required" });
  }

  // Traer advance y ese schedule
  const { data: adv, error: advErr } = await supabase
    .from("operational_advances")
    .select("*")
    .eq("id", id)
    .single();
  if (advErr || !adv) return res.status(404).json({ error: "advance not found" });

  const { data: sch, error: schErr } = await supabase
    .from("operational_advance_schedule")
    .select("*")
    .eq("advance_id", id)
    .eq("installment_no", Number(installment_no))
    .single();
  if (schErr || !sch) return res.status(404).json({ error: "installment not found" });

  if (sch.status === "paid") {
    return res.status(400).json({ error: "installment already paid" });
  }

  const paidDate: string = /^\d{4}-\d{2}-\d{2}$/.test(String(paid_date))
    ? paid_date
    : new Date().toISOString().slice(0, 10);

  const paidAmount = Math.round(Number(amount || sch.installment_amount));

  // 1) Marcar paid
  const { error: upErr } = await supabase
    .from("operational_advance_schedule")
    .update({ status: "paid", paid_date: paidDate })
    .eq("id", sch.id);

  if (upErr) return res.status(500).json({ error: upErr.message });

  // 3) Si todas pagadas -> cerrar advance
  const { data: rest, error: pendingErr } = await supabase
    .from("operational_advance_schedule")
    .select("status")
    .eq("advance_id", id)
    .neq("status", "paid")
    .limit(1);
  if (!pendingErr && (rest?.length ?? 0) === 0) {
    await supabase
      .from("operational_advances")
      .update({ status: "closed" })
      .eq("id", id);
  }

  res.json({ ok: true });
});

// --------- PATCH /advances/:id  (actualizar status/notas) ------------
r.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const payload: any = {};
  if (typeof req.body.notes === "string") payload.notes = req.body.notes;
  if (typeof req.body.status === "string") {
    if (!["active","closed","cancelled"].includes(req.body.status)) {
      return res.status(400).json({ error: "invalid status" });
    }
    payload.status = req.body.status;
  }

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: "no fields to update" });
  }

  const { data, error } = await supabase
    .from("operational_advances")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ advance: data });
});

export default r;
