// src/routes/payments.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const PLATE_RE = /^[A-Z]{3}\d{3}$/;
const r = Router();

type InstallmentStatus = "paid" | "pending" | null;

function isISODate(s: any): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toIntMoney(n: any): number {
  // amount viene como number; lo guardamos como bigint/int (COP) sin decimales
  // (mantén coherencia: la UI siempre manda enteros COP)
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  return Math.round(x);
}

function clampNonNeg(n: number): number {
  return Math.max(0, Math.round(n));
}

function addDays(isoDate: string, days: number): string {
  // isoDate YYYY-MM-DD
  const d = new Date(isoDate + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function logInconsistency(params: {
  payment_id?: number | null;
  plate: string;
  payment_date?: string | null;
  issue_code: string;
  message?: string | null;
  metadata?: any;
}) {
  try {
    await supabase.from("payment_inconsistencies").insert([
      {
        payment_id: params.payment_id ?? null,
        plate: params.plate,
        payment_date: params.payment_date ?? null,
        issue_code: params.issue_code,
        message: params.message ?? null,
        metadata: params.metadata ?? {},
      },
    ]);
  } catch {
    // No bloqueamos el flujo por fallos de logging
  }
}

/**
 * Regla base automática (siempre, incluso sin installment_number):
 * insurance:
 *   - si amount >= 5000 => 5000
 *   - else 0
 * delivery:
 *   - si amount > insurance => min(65000, amount - insurance)
 *   - else 0
 * credit:
 *   - max(0, amount - insurance - delivery)
 */
function computeBaseSplit(totalAmount: number) {
  const amount = clampNonNeg(totalAmount);
  const insurance = amount >= 5000 ? 5000 : 0;
  const delivery = amount > insurance ? Math.min(65000, amount - insurance) : 0;
  const credit = Math.max(0, amount - insurance - delivery);
  return { insurance, delivery, credit };
}

/**
 * Lógica de split con installment:
 * - Si installment_number != null y amount < 70000:
 *   - NO rechaza
 *   - credit = 0
 *   - installment_status = pending
 *   - si amount > 5000 => insurance=5000, delivery=amount-5000
 *   - si amount <= 5000 => insurance=0, delivery=0
 *   - shortfall = 70000 - amount
 * - Si installment_number != null y amount >= 70000:
 *   - split base, credit por resto
 *   - installment_status = paid si credit > 0 else pending
 *   - shortfall = 0
 */
function computeInstallmentSplit(totalAmount: number) {
  const amount = clampNonNeg(totalAmount);

  if (amount < 70000) {
    if (amount > 5000) {
      const insurance = 5000;
      const delivery = amount - 5000;
      return {
        insurance,
        delivery,
        credit: 0,
        installment_status: "pending" as const,
        shortfall: 70000 - amount,
        issue_code: "AMOUNT_LT_70000_INSTALLMENT_PENDING" as const,
      };
    }
    return {
      insurance: 0,
      delivery: 0,
      credit: 0,
      installment_status: "pending" as const,
      shortfall: 70000 - amount,
      issue_code: "AMOUNT_LT_70000_INSTALLMENT_PENDING" as const,
    };
  }

  const base = computeBaseSplit(amount);
  const installment_status: InstallmentStatus = base.credit > 0 ? "paid" : "pending";
  return {
    ...base,
    installment_status,
    shortfall: 0,
    issue_code: null as string | null,
  };
}

function hasAnyOverride(body: any): boolean {
  return (
    body?.force_override === true ||
    body?.insurance_amount != null ||
    body?.delivery_amount != null ||
    body?.credit_installment_amount != null
  );
}

async function getActiveAdvanceByPlateOrError(plate: string, paymentDate: string, paymentIdForLog: number | null) {
  const { data, error } = await supabase
    .from("operational_advances")
    .select("id, plate, start_date, status")
    .eq("plate", plate)
    .eq("status", "active");

  if (error) {
    await logInconsistency({
      payment_id: paymentIdForLog,
      plate,
      payment_date: paymentDate,
      issue_code: "ADVANCE_LOOKUP_ERROR",
      message: error.message,
    });
    return { kind: "error" as const, error: error.message };
  }

  const list = data ?? [];
  if (list.length > 1) {
    await logInconsistency({
      payment_id: paymentIdForLog,
      plate,
      payment_date: paymentDate,
      issue_code: "MULTIPLE_ACTIVE_ADVANCES",
      message: "More than one active advance for plate.",
      metadata: { count: list.length, advance_ids: list.map((a: any) => a.id) },
    });
    return { kind: "multiple" as const };
  }

  if (list.length === 0) {
    return { kind: "none" as const };
  }

  return { kind: "one" as const, advance: list[0] as any };
}

async function ensureScheduleRow(params: {
  advance_id: number;
  start_date: string;
  installment_no: number;
  payment_date: string;
  plate: string;
  payment_id: number | null;
  desired_status: "paid" | "pending";
}) {
  const { advance_id, start_date, installment_no } = params;

  const { data: existing, error: exErr } = await supabase
    .from("operational_advance_schedule")
    .select("*")
    .eq("advance_id", advance_id)
    .eq("installment_no", installment_no)
    .maybeSingle();

  // @ts-ignore
  if (exErr && exErr.code !== "PGRST116") {
    await logInconsistency({
      payment_id: params.payment_id,
      plate: params.plate,
      payment_date: params.payment_date,
      issue_code: "SCHEDULE_LOOKUP_ERROR",
      message: exErr.message,
      metadata: { advance_id, installment_no },
    });
    return { ok: false as const, error: exErr.message };
  }

  if (existing) {
    return { ok: true as const, row: existing };
  }

  // Crear fila faltante: due_date diario basado en start_date + (installment_no - 1)
  const due_date = addDays(start_date, Math.max(0, installment_no - 1));

  const rowToInsert = {
    advance_id,
    installment_no,
    due_date,
    // No tenemos breakdown real aquí (porque el préstamo es “daily_installment” en advances,
    // pero el schedule tiene interés/principal). Como esto es para “reparar inconsistencia”,
    // insertamos amounts en 0 y lo registramos como inconsistencia para revisión.
    installment_amount: 0,
    interest_amount: 0,
    principal_amount: 0,
    status: params.desired_status,
    paid_date: params.desired_status === "paid" ? params.payment_date : null,
  };

  const { data: ins, error: insErr } = await supabase
    .from("operational_advance_schedule")
    .insert([rowToInsert])
    .select("*")
    .single();

  if (insErr) {
    await logInconsistency({
      payment_id: params.payment_id,
      plate: params.plate,
      payment_date: params.payment_date,
      issue_code: "SCHEDULE_MISSING_CREATE_FAILED",
      message: insErr.message,
      metadata: { advance_id, installment_no, due_date, desired_status: params.desired_status },
    });
    return { ok: false as const, error: insErr.message };
  }

  await logInconsistency({
    payment_id: params.payment_id,
    plate: params.plate,
    payment_date: params.payment_date,
    issue_code: "SCHEDULE_MISSING_CREATED",
    message: "Schedule row was missing and was created automatically.",
    metadata: { created_row: ins },
  });

  return { ok: true as const, row: ins };
}

async function applyScheduleStatus(params: {
  schedule_id: number;
  desired_status: "paid" | "pending";
  payment_date: string;
  plate: string;
  payment_id: number | null;
}) {
  // Traer status actual para proteger paid -> pending
  const { data: row, error } = await supabase
    .from("operational_advance_schedule")
    .select("id, status")
    .eq("id", params.schedule_id)
    .single();

  if (error || !row) {
    await logInconsistency({
      payment_id: params.payment_id,
      plate: params.plate,
      payment_date: params.payment_date,
      issue_code: "SCHEDULE_STATUS_READ_ERROR",
      message: error?.message || "schedule not found by id",
      metadata: { schedule_id: params.schedule_id },
    });
    return { ok: false as const, error: error?.message || "schedule read error" };
  }

  // No revertimos paid -> pending
  if (row.status === "paid" && params.desired_status === "pending") {
    await logInconsistency({
      payment_id: params.payment_id,
      plate: params.plate,
      payment_date: params.payment_date,
      issue_code: "SCHEDULE_ALREADY_PAID_NOT_REVERTED",
      message: "Attempted to mark a paid installment as pending; ignored.",
      metadata: { schedule_id: params.schedule_id },
    });
    return { ok: true as const, skipped: true as const };
  }

  const patch =
    params.desired_status === "paid"
      ? { status: "paid", paid_date: params.payment_date }
      : { status: "pending", paid_date: null };

  const { error: upErr } = await supabase
    .from("operational_advance_schedule")
    .update(patch)
    .eq("id", params.schedule_id);

  if (upErr) {
    await logInconsistency({
      payment_id: params.payment_id,
      plate: params.plate,
      payment_date: params.payment_date,
      issue_code: "SCHEDULE_STATUS_UPDATE_ERROR",
      message: upErr.message,
      metadata: { schedule_id: params.schedule_id, desired_status: params.desired_status },
    });
    return { ok: false as const, error: upErr.message };
  }

  return { ok: true as const };
}

async function maybeCloseAdvance(advance_id: number) {
  const { data: rest, error } = await supabase
    .from("operational_advance_schedule")
    .select("id")
    .eq("advance_id", advance_id)
    .neq("status", "paid")
    .limit(1);

  if (!error && (rest?.length ?? 0) === 0) {
    await supabase.from("operational_advances").update({ status: "closed" }).eq("id", advance_id);
  }
}

// -------------------- POST /payments --------------------
r.post("/", async (req: Request, res: Response) => {
  const {
    payer_name,
    plate,
    payment_date,
    amount,
    installment_number,
    proof_url,
    status,

    insurance_amount,
    delivery_amount,
    credit_installment_amount,
    force_override,
  } = req.body || {};

  // Validaciones base
  if (typeof payer_name !== "string" || !payer_name.trim()) {
    return res.status(400).json({ error: "payer_name required" });
  }

  if (typeof plate !== "string" || !PLATE_RE.test(plate.toUpperCase())) {
    return res.status(400).json({ error: "plate must be ABC123 format" });
  }

  if (!isISODate(payment_date)) {
    return res.status(400).json({ error: "payment_date must be YYYY-MM-DD" });
  }

  const amt = toIntMoney(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  const instNo: number | null =
    installment_number == null || installment_number === ""
      ? null
      : Number(installment_number);

  if (instNo != null && !(Number.isInteger(instNo) && instNo > 0)) {
    return res.status(400).json({ error: "installment_number must be an integer > 0" });
  }

  if (typeof proof_url !== "string" || !/^https?:\/\//i.test(proof_url)) {
    return res.status(400).json({ error: "proof_url required (upload image first)" });
  }

  const allowedStatus = new Set(["pending", "confirmed", "rejected"]);
  const safeStatus = allowedStatus.has(status) ? status : "pending";

  const upperPlate = plate.toUpperCase();

  // validar placa existe
  const { data: v, error: vErr } = await supabase
    .from("vehicles")
    .select("plate")
    .eq("plate", upperPlate)
    .single();

  // @ts-ignore
  if (vErr && vErr.code !== "PGRST116") {
    return res.status(500).json({ error: vErr.message });
  }
  if (!v) {
    return res.status(400).json({ error: "unknown plate" });
  }

  // ---------------- Split siempre ----------------
  const wantsOverride = force_override === true || hasAnyOverride(req.body);

  let splitInsurance = 0;
  let splitDelivery = 0;
  let splitCredit = 0;
  let installment_status: InstallmentStatus = null;
  let installment_shortfall: number | null = null;

  // 1) calcular split automático base
  if (instNo == null) {
    const base = computeBaseSplit(amt);
    splitInsurance = base.insurance;
    splitDelivery = base.delivery;
    splitCredit = base.credit;
    installment_status = null;
    installment_shortfall = null;
  } else {
    const calc = computeInstallmentSplit(amt);
    splitInsurance = calc.insurance;
    splitDelivery = calc.delivery;
    splitCredit = calc.credit;
    installment_status = calc.installment_status;
    installment_shortfall = calc.shortfall;

    if (calc.issue_code) {
      // log, aún sin payment_id (todavía no insertamos)
      await logInconsistency({
        payment_id: null,
        plate: upperPlate,
        payment_date,
        issue_code: calc.issue_code,
        message: "Installment payment amount < 70000; installment marked pending and credit set to 0.",
        metadata: { amount: amt, installment_no: instNo },
      });
    }
  }

  // 2) si override, aplicarlo (pero con reglas de protección)
  if (wantsOverride) {
    const i = insurance_amount == null ? null : toIntMoney(insurance_amount);
    const d = delivery_amount == null ? null : toIntMoney(delivery_amount);
    const c = credit_installment_amount == null ? null : toIntMoney(credit_installment_amount);

    // Si envían algo inválido, 400
    const bad =
      (i != null && (!Number.isFinite(i) || i < 0)) ||
      (d != null && (!Number.isFinite(d) || d < 0)) ||
      (c != null && (!Number.isFinite(c) || c < 0));

    if (bad) {
      return res.status(400).json({ error: "override amounts must be non-negative integers" });
    }

    // Tomamos valores enviados; los que no envían siguen como calculados
    const oInsurance = i ?? splitInsurance;
    const oDelivery = d ?? splitDelivery;
    const oCredit = c ?? splitCredit;

    const sum = oInsurance + oDelivery + oCredit;

    if (sum > amt) {
      // Remainder negativo: según tu regla => shortfall y status pending (si hay installment)
      if (instNo != null) {
        installment_status = "pending";
        installment_shortfall = (installment_shortfall ?? 0) + (sum - amt);
        splitInsurance = oInsurance;
        splitDelivery = oDelivery;
        splitCredit = 0; // no guardamos negativos
        await logInconsistency({
          payment_id: null,
          plate: upperPlate,
          payment_date,
          issue_code: "REMAINDER_NEGATIVE_OVERRIDE",
          message: "Override split sum exceeded amount; credit set to 0 and installment marked pending.",
          metadata: { amount: amt, sum, insurance: oInsurance, delivery: oDelivery, credit: oCredit },
        });
      } else {
        // sin cuota: no tiene sentido permitir sum > amount
        return res.status(400).json({ error: "override split cannot exceed amount" });
      }
    } else {
      // sum <= amount
      splitInsurance = oInsurance;
      splitDelivery = oDelivery;

      // Si no enviaron credit, lo recalculamos como resto para mantener consistencia contable
      // (si enviaron credit explícito, lo respetamos)
      splitCredit = c == null ? Math.max(0, amt - oInsurance - oDelivery) : oCredit;

      // Si hay installment y amount < 70000, forzamos reglas (tu regla manda)
      if (instNo != null && amt < 70000) {
        splitCredit = 0;
        installment_status = "pending";
        installment_shortfall = 70000 - amt;

        // regla especial: si amt > 5000 => insurance 5000 y resto delivery
        if (amt > 5000) {
          splitInsurance = 5000;
          splitDelivery = amt - 5000;
        } else {
          splitInsurance = 0;
          splitDelivery = 0;
        }
      } else if (instNo != null) {
        // amount >= 70000: status depende de crédito (>0 => paid)
        installment_status = splitCredit > 0 ? "paid" : "pending";
        installment_shortfall = installment_shortfall ?? 0;
      }
    }
  }

  // ---------------- Validación advances (solo si installment_number != null) ----------------
  // Si hay installment_number, y hay múltiples advances activos -> rechazar 400 y log
  if (instNo != null) {
    const advRes = await getActiveAdvanceByPlateOrError(upperPlate, payment_date, null);
    if (advRes.kind === "multiple") {
      return res.status(400).json({
        error: "No puede haber más de un préstamo activo por placa. Consulte el encargado.",
      });
    }
    if (advRes.kind === "error") {
      // No bloqueamos el pago por fallo de lookup, pero lo dejamos registrado y NO tocamos schedule.
      await logInconsistency({
        payment_id: null,
        plate: upperPlate,
        payment_date,
        issue_code: "ADVANCE_LOOKUP_ERROR_NO_SCHEDULE_UPDATE",
        message: advRes.error,
      });
    }
  }

  // ---------------- Insert payment ----------------
  const insertPayload: any = {
    payer_name: payer_name.trim(),
    plate: upperPlate,
    payment_date,
    amount: amt,
    installment_number: instNo,
    proof_url: proof_url ?? null,
    status: safeStatus,

    insurance_amount: splitInsurance,
    delivery_amount: splitDelivery,
    credit_installment_amount: splitCredit,
    installment_status: installment_status,
    installment_shortfall: installment_shortfall,
  };

  const { data: payment, error: insErr } = await supabase
    .from("payments")
    .insert([insertPayload])
    .select()
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  // ---------------- Update schedule (solo si installment_number != null) ----------------
  // Protección: si payment fue rejected, NO tocamos schedule.
  if (instNo != null && safeStatus !== "rejected") {
    const advRes = await getActiveAdvanceByPlateOrError(upperPlate, payment_date, payment.id);

    if (advRes.kind === "one") {
      const advance = advRes.advance;

      // 1) asegurar schedule row (crear si falta)
      const ensured = await ensureScheduleRow({
        advance_id: advance.id,
        start_date: advance.start_date,
        installment_no: instNo,
        payment_date,
        plate: upperPlate,
        payment_id: payment.id,
        desired_status: installment_status === "paid" ? "paid" : "pending",
      });

      if (ensured.ok) {
        // 2) aplicar paid/pending (con protección no revertir paid->pending)
        await applyScheduleStatus({
          schedule_id: ensured.row.id,
          desired_status: installment_status === "paid" ? "paid" : "pending",
          payment_date,
          plate: upperPlate,
          payment_id: payment.id,
        });

        // 3) cierre si ya no quedan pendientes
        await maybeCloseAdvance(advance.id);
      } else {
        await logInconsistency({
          payment_id: payment.id,
          plate: upperPlate,
          payment_date,
          issue_code: "SCHEDULE_ENSURE_FAILED",
          message: ensured.error,
          metadata: { advance_id: advance.id, installment_no: instNo },
        });
      }
    } else if (advRes.kind === "none") {
      await logInconsistency({
        payment_id: payment.id,
        plate: upperPlate,
        payment_date,
        issue_code: "NO_ACTIVE_ADVANCE_FOR_INSTALLMENT_PAYMENT",
        message: "Payment has installment_number but no active advance found for plate.",
        metadata: { installment_no: instNo },
      });
    } else if (advRes.kind === "multiple") {
      // Esto no debería pasar aquí porque ya validamos antes, pero por seguridad:
      await logInconsistency({
        payment_id: payment.id,
        plate: upperPlate,
        payment_date,
        issue_code: "MULTIPLE_ACTIVE_ADVANCES_POST_INSERT",
        message: "Multiple active advances detected after payment insert.",
      });
    } else {
      // error
      await logInconsistency({
        payment_id: payment.id,
        plate: upperPlate,
        payment_date,
        issue_code: "ADVANCE_LOOKUP_ERROR_POST_INSERT",
        message: (advRes as any).error || "advance lookup error",
      });
    }
  } else if (instNo != null && safeStatus === "rejected") {
    await logInconsistency({
      payment_id: payment.id,
      plate: upperPlate,
      payment_date,
      issue_code: "PAYMENT_REJECTED_NO_SCHEDULE_UPDATE",
      message: "Payment is rejected; schedule was not updated.",
      metadata: { installment_no: instNo },
    });
  }

  return res.status(201).json(payment);
});

// -------------------- GET /payments (igual que antes) --------------------
r.get("/", async (req: Request, res: Response) => {
  const rawLimit = parseInt(String(req.query.limit || "10"), 10);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 10 : rawLimit, 1000));

  const rawOffset = parseInt(String(req.query.offset || "0"), 10);
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

  const plate = String(req.query.plate || "").toUpperCase().trim();
  const month = String(req.query.month || "").trim(); // YYYY-MM

  if (plate && !PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "invalid plate (expected ABC123)" });
  }

  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "invalid month (expected YYYY-MM)" });
  }

  let q = supabase
    .from("payments")
    .select("*", { count: "exact" })
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (plate) q = q.eq("plate", plate);

  if (month) {
    const parts = month.split("-");
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: "invalid month (expected YYYY-MM)" });
    }

    const from = `${month}-01`;
    const nextYear = m === 12 ? y + 1 : y;
    const nextMonthNum = m === 12 ? 1 : m + 1;
    const nextMonth = `${nextYear}-${String(nextMonthNum).padStart(2, "0")}`;
    const to = `${nextMonth}-01`;

    q = q.gte("payment_date", from).lt("payment_date", to);
  }

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ items: data ?? [], total: count ?? 0, limit, offset });
});

// -------------------- GET /payments/last-amount (igual que antes) --------------------
r.get("/last-amount", async (req: Request, res: Response) => {
  const plate = String(req.query.plate || "").toUpperCase().trim();
  if (!PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "invalid plate" });
  }

  const { data, error } = await supabase
    .from("payments")
    .select("plate, payment_date, amount, status, installment_number, created_at")
    .eq("plate", plate)
    //.eq("status", "confirmed")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // @ts-ignore
  if (error && error.code !== "PGRST116") {
    return res.status(500).json({ error: error.message });
  }
  if (!data) {
    return res.status(404).json({ error: "no confirmed payments" });
  }

  return res.json({
    plate: data.plate,
    last_payment_date: data.payment_date,
    last_amount: data.amount,
    last_status: data.status,
    last_installment_number: data.installment_number,
  });
});

export default r;
