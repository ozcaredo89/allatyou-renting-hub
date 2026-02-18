// src/routes/advances.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

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
    if (!person_name || typeof person_name !== "string") return res.status(400).json({ error: "person_name required" });
    if (!["driver", "collaborator"].includes(person_type)) return res.status(400).json({ error: "person_type invalid" });
    if (!(Number(amount) > 0)) return res.status(400).json({ error: "amount > 0 required" });
    if (!(Number(installments) >= 1)) return res.status(400).json({ error: "installments >= 1 required" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start_date))) return res.status(400).json({ error: "start_date must be YYYY-MM-DD" });
    if (!(daily_installment > 0)) return res.status(400).json({ error: "daily_installment > 0 required" });

    // Validar existencia de placa/driver
    if (!(await plateExists(plate))) return res.status(400).json({ error: "plate not found or invalid" });
    
    // Regla: solo 1 advance activo por placa
    if (plate) {
      const upperPlate = String(plate).toUpperCase();
      const { data: existing, error: exErr } = await supabase
        .from("operational_advances")
        .select("id")
        .eq("plate", upperPlate)
        .eq("status", "active")
        .limit(1);

      if (exErr) return res.status(500).json({ error: exErr.message });
      if ((existing?.length ?? 0) > 0) {
        return res.status(400).json({ error: "Ya existe un préstamo activo para esta placa." });
      }
    }

    if (!(await driverExists(driver_id))) return res.status(400).json({ error: "driver_id not found" });

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
        current_installment: 0 // Inicializamos en 0
      })
      .select("*")
      .single();

    if (advErr || !advIns) {
      const msg = String(advErr?.message || "");
      if (msg.includes("duplicate key") || msg.includes("uidx_operational_advances_one_active_per_plate")) {
        return res.status(400).json({ error: "Ya existe un préstamo activo para esta placa." });
      }
      return res.status(500).json({ error: advErr?.message || "insert failed" });
    }

    // 2) Generar cronograma
    const schedule = Array.from({ length: advIns.installments }, (_, i) => {
      const installmentNo = i + 1;
      const dueDate = new Date(advIns.start_date);
      dueDate.setDate(dueDate.getDate() + i);

      return {
        advance_id: advIns.id,
        installment_no: installmentNo,
        due_date: dueDate.toISOString().slice(0, 10),
        installment_amount: advIns.daily_installment,
        interest_amount: 0,
        principal_amount: advIns.daily_installment,
        status: "pending",
      };
    });

    const { error: schErr } = await supabase.from("operational_advance_schedule").insert(schedule);

    if (schErr) {
      await supabase.from("operational_advances").delete().eq("id", advIns.id);
      return res.status(500).json({ error: schErr.message });
    }

    return res.json({ advance: advIns });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "internal error" });
  }
});

// --------- GET /advances -------------
r.get("/", async (req: Request, res: Response) => {
  const { status, person, plate, limit = "50", offset = "0" } = req.query as Record<string, string>;

  let q = supabase
    .from("operational_advances")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);
  if (plate) q = q.eq("plate", plate.toUpperCase());
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
  const withOverdue = (sch ?? []).map((row) => {
    const isPaid = row.status === "paid";
    const overdue = !isPaid && row.due_date < today;
    return { ...row, overdue };
  });

  res.json({ items: withOverdue });
});

// --------- POST /advances/:id/payments -------------------
// NOTA: Mantenemos esta por compatibilidad, pero la edición real ahora se hace en PATCH abajo
r.post("/:id/payments", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const { installment_no, paid_date, amount } = req.body || {};
  if (!(Number(installment_no) >= 1)) {
    return res.status(400).json({ error: "installment_no required" });
  }

  // Traer advance para saber total cuotas
  const { data: adv, error: advErr } = await supabase
    .from("operational_advances")
    .select("*")
    .eq("id", id)
    .single();
  if (advErr || !adv) return res.status(404).json({ error: "advance not found" });

  // Traer cuota específica
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

  const paidDate = /^\d{4}-\d{2}-\d{2}$/.test(String(paid_date))
    ? paid_date
    : new Date().toISOString().slice(0, 10);

  // 1) Marcar la cuota como pagada
  const { error: upErr } = await supabase
    .from("operational_advance_schedule")
    .update({ status: "paid", paid_date: paidDate })
    .eq("id", sch.id);

  if (upErr) return res.status(500).json({ error: upErr.message });

  // 2) Contar cuántas cuotas pagadas lleva ESTE advance
  const { count: paidCount, error: countErr } = await supabase
    .from("operational_advance_schedule")
    .select("*", { count: "exact", head: true })
    .eq("advance_id", id)
    .eq("status", "paid");

  if (!countErr && typeof paidCount === "number") {
    const isComplete = paidCount >= adv.installments;
    
    // 3) Actualizar current_installment y cerrar si aplica
    await supabase
      .from("operational_advances")
      .update({
        current_installment: paidCount,
        status: isComplete ? "closed" : "active", // Cierre automático
        updated_at: new Date().toISOString()
      })
      .eq("id", id);
  }

  res.json({ ok: true });
});

// --------- PATCH /advances/:id ---------------------------
r.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const payload: any = {};
  if (typeof req.body.notes === "string") payload.notes = req.body.notes;
  if (typeof req.body.status === "string") {
    if (!["active", "closed", "cancelled"].includes(req.body.status)) {
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

// --------- PATCH /advances/:id/schedule/:rowId (EDITAR CUOTA COMPLETA) ---------
// Permite cambiar estado (pending/paid), fecha y monto, recalculando el avance
r.patch("/:id/schedule/:rowId", async (req: Request, res: Response) => {
  const advanceId = Number(req.params.id);
  const rowId = Number(req.params.rowId);
  
  // Datos que queremos editar
  const { status, date, amount } = req.body; // date puede ser due_date o paid_date según el status

  if (!advanceId || !rowId) return res.status(400).json({ error: "Invalid IDs" });

  try {
    // 1. Validar estado válido
    if (status && !["pending", "paid"].includes(status)) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    // 2. Preparar payload de actualización
    const updates: any = {};
    if (amount !== undefined) updates.installment_amount = Number(amount);
    
    if (status === "paid") {
      updates.status = "paid";
      updates.paid_date = date || new Date().toISOString().slice(0, 10); // Si es paid, necesitamos fecha de pago
    } else if (status === "pending") {
      updates.status = "pending";
      updates.paid_date = null; // Si vuelve a pendiente, borramos fecha de pago
      if (date) updates.due_date = date; // Opcional: permitir cambiar fecha de vencimiento
    }

    // 3. Actualizar la fila del cronograma
    const { error: upErr } = await supabase
      .from("operational_advance_schedule")
      .update(updates)
      .eq("id", rowId)
      .eq("advance_id", advanceId); // Seguridad: que pertenezca al advance correcto

    if (upErr) throw new Error(upErr.message);

    // 4. RECALCULAR PROGRESO DEL PRÉSTAMO PADRE
    // Contamos cuántas quedaron pagadas en total para este préstamo
    const { count: paidCount, error: countErr } = await supabase
      .from("operational_advance_schedule")
      .select("*", { count: "exact", head: true })
      .eq("advance_id", advanceId)
      .eq("status", "paid");

    if (!countErr && typeof paidCount === "number") {
      // Traemos el total de cuotas para saber si cerramos o abrimos
      const { data: adv } = await supabase
        .from("operational_advances")
        .select("installments, status")
        .eq("id", advanceId)
        .single();

      if (adv) {
        const isComplete = paidCount >= adv.installments;
        const newStatus = isComplete ? "closed" : "active"; // Si estaba closed y le restamos pagos, vuelve a active

        await supabase
          .from("operational_advances")
          .update({
            current_installment: paidCount,
            status: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq("id", advanceId);
      }
    }

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default r;