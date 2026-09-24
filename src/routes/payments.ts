// src/routes/payments.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { getActiveLeasingContract, applyLeasingPayment } from "../lib/leasingCascade";
import { getAmortizationDates, nextPayableDate } from "../lib/noPay";
import { randomUUID } from "crypto";
import {
  classifyReceipt,
  suspiciousOnlyFilter,
  buildAmountMismatch,
  buildDuplicatePayments,
  buildMatchContext,
  refineReasonsForEvidence,
  collectDuplicateIds,
  FlagDetails,
  DuplicatePaymentSummary,
} from "../lib/receiptClassification";

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
 * Regla base automática (para pagos SIN installment_number):
 * insurance (depósito):
 *   - si amount >= 5000 => 5000
 *   - else 0
 * maintenance (provisión mantenimiento):
 *   - si amount > insurance => min(6000, amount - insurance)
 *   - else 0
 * delivery (ingreso neto):
 *   - Todo el remanente va a delivery (sin tope de $65.000).
 *   - El tope anterior causaba que montos > $76.000 sin cuota enviaran
 *     el excedente a credit_installment_amount (bug confirmado #5229).
 * credit:
 *   - Siempre 0 cuando no hay installment_number.
 */
function computeBaseSplit(totalAmount: number) {
  const amount = clampNonNeg(totalAmount);
  const insurance = amount >= 5000 ? 5000 : 0;
  const maintenance = amount > insurance ? Math.min(6000, amount - insurance) : 0;
  // Sin tope: el remanente completo va a delivery cuando no hay cuota de crédito
  const delivery = amount > (insurance + maintenance) ? amount - insurance - maintenance : 0;
  const credit = 0; // Nunca hay crédito en pagos sin installment_number
  return { insurance, maintenance, delivery, credit };
}

/**
 * Lógica de split con installment:
 * - Si installment_number != null y amount < 70000:
 *   - NO rechaza
 *   - credit = 0
 *   - installment_status = pending
 *   - insurance = min(5000, amount)
 *   - maintenance = min(6000, amount - insurance)
 *   - delivery = amount - insurance - maintenance
 *   - shortfall = 70000 - amount
 * - Si installment_number != null y amount >= 70000:
 *   - split base, credit por resto
 *   - installment_status = paid si credit > 0 else pending
 *   - shortfall = 0
 */
function computeInstallmentSplit(totalAmount: number) {
  const amount = clampNonNeg(totalAmount);

  if (amount < 70000) {
    const insurance = amount >= 5000 ? 5000 : 0;
    const maintenance = amount > insurance ? Math.min(6000, amount - insurance) : 0;
    const delivery = amount > (insurance + maintenance) ? amount - insurance - maintenance : 0;
    return {
      insurance,
      maintenance,
      delivery,
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

// Helper para determinar la tarifa diaria de renta de un vehículo (drivers_vw, leasing o historial)
async function resolveDailyRentRate(plate: string, queryAmount = 0): Promise<{
  dailyRate: number;
  isLeasing: boolean;
  driverName: string | null;
  driverVw: any;
}> {
  const { data: driverVw } = await supabase
    .from("drivers_vw")
    .select("plate, driver_name, has_credit, default_amount, default_installment")
    .eq("plate", plate)
    .maybeSingle();

  let dailyRate = driverVw?.default_amount ? Number(driverVw.default_amount) : 0;
  let isLeasing = false;
  const leasingContract = await getActiveLeasingContract(plate);
  if (leasingContract) {
    isLeasing = true;
    const { data: nextCuota } = await supabase
      .from("leasing_schedule")
      .select("maintenance_expected, admin_expected, interest_expected, principal_expected")
      .eq("contract_id", leasingContract.id)
      .neq("status", "paid")
      .order("installment_no", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextCuota) {
      dailyRate = Math.round(
        Number(nextCuota.maintenance_expected) +
        Number(nextCuota.admin_expected) +
        Number(nextCuota.interest_expected) +
        Number(nextCuota.principal_expected)
      );
    }
  }

  if (dailyRate === 0 && queryAmount > 0) {
    dailyRate = queryAmount;
  }

  if (dailyRate === 0) {
    const { data: lastPayment } = await supabase
      .from("payments")
      .select("amount")
      .eq("plate", plate)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastPayment?.amount) {
      dailyRate = Number(lastPayment.amount);
    }
  }

  if (dailyRate === 0) {
    const { data: pendingLc } = await supabase
      .from("leasing_contracts")
      .select("daily_maintenance, daily_admin, daily_capital_interest")
      .eq("plate", plate)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingLc) {
      dailyRate = Math.round(
        Number(pendingLc.daily_maintenance || 0) +
        Number(pendingLc.daily_admin || 0) +
        Number(pendingLc.daily_capital_interest || 0)
      );
    }
  }

  if (dailyRate === 0) {
    dailyRate = 70000;
  }

  return { dailyRate, isLeasing, driverName: driverVw?.driver_name ?? null, driverVw };
}

// -------------------- GET /payments/batch-preview --------------------
// Recibe plate, start_date, days_count.
// Retorna fechas pagables reales, tarifa diaria y desglose por día.
// Es la Single Source of Truth que usa Pay.tsx para mostrar el resumen
// y el mismo cálculo que usa el backend al procesar el lote.
r.get("/batch-preview", async (req: Request, res: Response) => {
  const plate = String(req.query.plate || "").toUpperCase().trim();
  const start_date = String(req.query.start_date || "").trim();
  const days_count = parseInt(String(req.query.days_count || ""), 10);

  if (!PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "plate must be ABC123 format" });
  }
  if (!isISODate(start_date)) {
    return res.status(400).json({ error: "start_date must be YYYY-MM-DD" });
  }
  if (!Number.isInteger(days_count) || days_count < 1 || days_count > 31) {
    return res.status(400).json({ error: "days_count must be an integer between 1 and 31" });
  }

  // Obtener tarifa diaria del vehículo (drivers_vw o vehicles)
  const { data: driverVw, error: dvErr } = await supabase
    .from("drivers_vw")
    .select("plate, driver_name, has_credit, default_amount, default_installment")
    .eq("plate", plate)
    .maybeSingle();

  if (dvErr) {
    return res.status(500).json({ error: dvErr.message });
  }

  // Verificar si tiene contrato activo de leasing para obtener la tarifa contractual
  let dailyRate = driverVw?.default_amount ? Number(driverVw.default_amount) : 0;
  let isLeasing = false;
  const leasingContract = await getActiveLeasingContract(plate);
  if (leasingContract) {
    isLeasing = true;
    const { data: nextCuota } = await supabase
      .from("leasing_schedule")
      .select("maintenance_expected, admin_expected, interest_expected, principal_expected")
      .eq("contract_id", leasingContract.id)
      .neq("status", "paid")
      .order("installment_no", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextCuota) {
      dailyRate = Math.round(
        Number(nextCuota.maintenance_expected) +
        Number(nextCuota.admin_expected) +
        Number(nextCuota.interest_expected) +
        Number(nextCuota.principal_expected)
      );
    }
  }

  // Fallbacks si el vehículo no tiene default_amount configurado
  const queryAmount = Number(req.query.amount || 0);
  if (dailyRate === 0 && queryAmount > 0) {
    dailyRate = queryAmount;
  }

  if (dailyRate === 0) {
    const { data: lastPayment } = await supabase
      .from("payments")
      .select("amount")
      .eq("plate", plate)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastPayment?.amount) {
      dailyRate = Number(lastPayment.amount);
    }
  }

  if (dailyRate === 0) {
    const { data: pendingLc } = await supabase
      .from("leasing_contracts")
      .select("daily_maintenance, daily_admin, daily_capital_interest")
      .eq("plate", plate)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingLc) {
      dailyRate = Math.round(
        Number(pendingLc.daily_maintenance || 0) +
        Number(pendingLc.daily_admin || 0) +
        Number(pendingLc.daily_capital_interest || 0)
      );
    }
  }

  // Verificar si tiene anticipo activo para incluir cuota en el desglose (solo si no es leasing)
  let advanceSummary: any = null;
  const fallbackDailyInstallment = driverVw?.default_installment ? Number(driverVw.default_installment) : 0;

  if (!isLeasing) {
    const { data: advData } = await supabase
      .from("operational_advances")
      .select("id, daily_installment, current_installment, installments, status")
      .eq("plate", plate)
      .eq("status", "active")
      .maybeSingle();

    if (advData) {
      const cuotasPendientes = Math.max(0, (advData.installments ?? 0) - (advData.current_installment ?? 0));
      const cuotasEnLote = Math.min(days_count, cuotasPendientes);
      advanceSummary = {
        advance_id: advData.id,
        daily_installment: advData.daily_installment ? Number(advData.daily_installment) : fallbackDailyInstallment,
        current_installment: advData.current_installment ?? 0,
        total_installments: advData.installments ?? 0,
        cuotas_pendientes: cuotasPendientes,
        cuotas_en_lote: cuotasEnLote,
      };
    }
  }

  // Calcular fechas pagables reales (saltando Pico y Placa / Calendario)
  let payableDates: string[] = [];
  try {
    const { dates } = await getAmortizationDates(plate, start_date, days_count);
    payableDates = dates;
  } catch (e: any) {
    return res.status(500).json({ error: `Error calculando fechas: ${e.message}` });
  }

  // Desglose por día
  const dayBreakdown = payableDates.map((date, idx) => {
    const amount = dailyRate;
    // Si es leasing, no hay cuota de crédito de anticipo operativo
    const baseInstNo = (!isLeasing && advanceSummary) ? (advanceSummary.current_installment + idx + 1) : null;
    const instNo = (!isLeasing && advanceSummary) ? baseInstNo : null;
    const split = instNo != null ? computeInstallmentSplit(amount) : computeBaseSplit(amount);
    return {
      date,
      amount,
      ...split,
      installment_number: instNo,
    };
  });

  const totalAmount = dayBreakdown.reduce((s: number, d: any) => s + d.amount, 0);

  return res.json({
    plate,
    start_date,
    days_count,
    daily_rate: dailyRate,
    is_leasing: isLeasing,
    payable_dates: payableDates,
    total_amount: totalAmount,
    day_breakdown: dayBreakdown,
    advance: advanceSummary,
    driver_name: driverVw?.driver_name ?? null,
  });
});

// -------------------- GET /payments/advance-payment-info --------------------
// Consulta estado de mora, tarifa diaria y si existe un anticipo activo para pagar con él
r.get("/advance-payment-info", async (req: Request, res: Response) => {
  const plate = String(req.query.plate || "").toUpperCase().trim();
  if (!PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "plate must be ABC123 format" });
  }

  // 1. Obtener datos de mora y último pago desde la vista oficial vehicle_last_payment
  const { data: vLast, error: vLastErr } = await supabase
    .from("vehicle_last_payment")
    .select("plate, owner_name, payment_date, days_since, is_overdue")
    .eq("plate", plate)
    .maybeSingle();

  if (vLastErr) {
    return res.status(500).json({ error: vLastErr.message });
  }

  // 2. Resolver tarifa diaria
  const { dailyRate, driverName } = await resolveDailyRentRate(plate);

  // 3. Buscar si tiene anticipo activo
  const { data: activeAdvance, error: advErr } = await supabase
    .from("operational_advances")
    .select("id, person_name, person_type, driver_id, plate, amount, daily_installment, installments, current_installment, start_date, status, notes, created_at")
    .eq("plate", plate)
    .eq("status", "active")
    .maybeSingle();

  if (advErr) {
    return res.status(500).json({ error: advErr.message });
  }

  const daysOverdue = vLast?.days_since ?? 0;
  const isOverdue = vLast?.is_overdue ?? false;
  const ownerName = driverName || vLast?.owner_name || activeAdvance?.person_name || null;

  const advanceAmount = activeAdvance ? Number(activeAdvance.amount) : 0;
  const maxCoveredDays = dailyRate > 0 && advanceAmount > 0 ? Math.floor(advanceAmount / dailyRate) : 0;
  const recommendedDays = Math.max(1, Math.min(daysOverdue > 0 ? daysOverdue : 1, maxCoveredDays > 0 ? maxCoveredDays : 1));

  return res.json({
    plate,
    owner_name: ownerName,
    days_overdue: daysOverdue,
    is_overdue: isOverdue,
    daily_rate: dailyRate,
    last_payment_date: vLast?.payment_date ?? null,
    has_active_advance: !!activeAdvance,
    active_advance: activeAdvance ?? null,
    max_covered_days: maxCoveredDays,
    recommended_days: recommendedDays,
  });
});

// -------------------- POST /payments/pay-with-advance --------------------
// Permite saldar días de mora cruzándolos contra un anticipo activo
r.post("/pay-with-advance", async (req: Request, res: Response) => {
  const {
    plate,
    advance_id,
    days_count,
    notes,
  } = req.body || {};

  const upperPlate = String(plate || "").toUpperCase().trim();
  if (!PLATE_RE.test(upperPlate)) {
    return res.status(400).json({ error: "plate must be ABC123 format" });
  }

  const days = parseInt(String(days_count || ""), 10);
  if (!Number.isInteger(days) || days < 1 || days > 31) {
    return res.status(400).json({ error: "days_count must be an integer between 1 and 31" });
  }

  const advId = Number(advance_id);
  if (!advId || advId <= 0) {
    return res.status(400).json({ error: "advance_id is required" });
  }

  // 1. Verificar anticipo activo
  const { data: advance, error: advErr } = await supabase
    .from("operational_advances")
    .select("*")
    .eq("id", advId)
    .eq("plate", upperPlate)
    .eq("status", "active")
    .maybeSingle();

  if (advErr) {
    return res.status(500).json({ error: advErr.message });
  }
  if (!advance) {
    return res.status(400).json({ error: `No se encontró un anticipo activo (#${advId}) para la placa ${upperPlate}.` });
  }

  // 2. Calcular tarifa diaria y monto total
  const { dailyRate, isLeasing, driverName } = await resolveDailyRentRate(upperPlate);
  const totalAmount = dailyRate * days;

  // Validación requerida: que el anticipo cubra el monto total
  if (totalAmount > advance.amount) {
    return res.status(400).json({
      error: `El total a cubrir ($${totalAmount.toLocaleString("es-CO")}) excede el valor del anticipo ($${advance.amount.toLocaleString("es-CO")}).`,
    });
  }

  // 3. Obtener último pago o fecha de referencia para arrancar
  const { data: lastPayment } = await supabase
    .from("payments")
    .select("payment_date")
    .eq("plate", upperPlate)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("created_at, current_driver_id, owner_name")
    .eq("plate", upperPlate)
    .maybeSingle();

  const refDate = lastPayment?.payment_date || vehicle?.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  // 4. Calcular próximas fechas pagables
  let payableDates: string[] = [];
  try {
    const { nextDate } = await nextPayableDate(upperPlate, refDate, false);
    const { dates } = await getAmortizationDates(upperPlate, nextDate, days);
    payableDates = dates;
  } catch (e: any) {
    return res.status(500).json({ error: `Error calculando fechas pagables: ${e.message}` });
  }

  if (payableDates.length === 0) {
    return res.status(400).json({ error: "No se pudieron generar fechas de pago hábiles." });
  }

  // 5. Preparar filas para inserción atómica con create_payment_batch
  const batchId = randomUUID();
  const payerName = advance.person_name || driverName || vehicle?.owner_name || "Conductor";
  const driverId = advance.driver_id || vehicle?.current_driver_id || null;
  const split = computeInstallmentSplit(dailyRate);

  const paymentsToInsert = payableDates.map((pDate, idx) => ({
    payer_name: payerName,
    plate: upperPlate,
    driver_id: driverId ? String(driverId) : "",
    payment_date: pDate,
    amount: dailyRate,
    installment_number: "", // No es cuota de amortización de préstamo sino renta
    proof_url: "",
    status: "confirmed",
    insurance_amount: split.insurance,
    maintenance_amount: split.maintenance,
    delivery_amount: split.delivery,
    credit_installment_amount: split.credit,
    installment_status: "paid",
    installment_shortfall: 0,
    reference_number: `ANTICIPO-${advance.id}-${pDate}`,
    provider_name: "Anticipo",
    receipt_date: pDate,
    receipt_status: "advance_offset",
    flag_details: {
      advance_id: advance.id,
      advance_amount: advance.amount,
      payment_type: "advance_offset",
      notes: notes || `Pago de mora cubierto con anticipo #${advance.id}`,
    },
    batch_id: batchId,
    batch_index: idx,
    batch_total_days: payableDates.length,
  }));

  // 6. Inserción atómica en base de datos
  const { error: rpcErr } = await supabase.rpc("create_payment_batch", {
    p_batch_id: batchId,
    p_payments: paymentsToInsert,
    p_advance_updates: [],
  });

  if (rpcErr) {
    return res.status(500).json({ error: `Error creando lote de pagos: ${rpcErr.message}` });
  }

  // 7. Si es leasing, aplicar cascada
  if (isLeasing) {
    const leasingContract = await getActiveLeasingContract(upperPlate);
    if (leasingContract) {
      try {
        const { data: insertedRows } = await supabase
          .from("payments")
          .select("id, amount")
          .eq("batch_id", batchId)
          .order("batch_index", { ascending: true });

        for (const row of insertedRows || []) {
          await applyLeasingPayment(row.id, Number(row.amount), leasingContract.id);
        }
      } catch (err: any) {
        console.error("[pay-with-advance] Error aplicando leasing:", err.message);
      }
    }
  }

  // 8. Log de auditoría
  await logInconsistency({
    plate: upperPlate,
    payment_date: payableDates[payableDates.length - 1] ?? null,
    issue_code: "ADVANCE_PAYMENT_OFFSET",
    message: `Pago de ${payableDates.length} día(s) con anticipo #${advance.id} por un total de $${totalAmount.toLocaleString("es-CO")}`,
    metadata: {
      advance_id: advance.id,
      days_count: payableDates.length,
      total_amount: totalAmount,
      batch_id: batchId,
      payable_dates: payableDates,
    },
  });

  return res.status(201).json({
    success: true,
    batch_id: batchId,
    days_count: payableDates.length,
    total_amount: totalAmount,
    advance_id: advance.id,
    payable_dates: payableDates,
  });
});

// -------------------- handleBatchPayment (lote multi-día) --------------------
// Maneja POST /payments cuando batch_mode === true.
// Paso 1 (ACID): RPC create_payment_batch inserta N filas atómicamente en Postgres.
// Paso 2 (Node): applyLeasingPayment — si falla, compensa borrando todo el lote.
async function handleBatchPayment(req: Request, res: Response): Promise<void> {
  const {
    payer_name,
    plate,
    amount,
    installment_number,
    proof_url,
    status,
    upload_id,
    skip_receipt_check,
    days_count,
    start_date: batchStartDate,
  } = req.body || {};

  // --- Validaciones básicas ---
  if (typeof payer_name !== "string" || !payer_name.trim()) {
    res.status(400).json({ error: "payer_name required" }); return;
  }
  if (typeof plate !== "string" || !PLATE_RE.test(plate.toUpperCase())) {
    res.status(400).json({ error: "plate must be ABC123 format" }); return;
  }
  if (!Number.isInteger(days_count) || days_count < 1 || days_count > 31) {
    res.status(400).json({ error: "days_count must be an integer between 1 and 31" }); return;
  }
  if (!isISODate(batchStartDate)) {
    res.status(400).json({ error: "start_date must be YYYY-MM-DD" }); return;
  }

  // Validar ventana de start_date: [hoy - 15 días, hoy + 7 días]
  const todayStr = new Date().toISOString().slice(0, 10);
  const minDate = addDays(todayStr, -15);
  const maxDate = addDays(todayStr, 7);
  if (batchStartDate < minDate || batchStartDate > maxDate) {
    res.status(400).json({ error: `start_date must be within 15 days in the past and 7 days in the future (${minDate} to ${maxDate})` }); return;
  }

  const amt = toIntMoney(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  if (typeof proof_url !== "string" || !/^https?:\/\//i.test(proof_url)) {
    res.status(400).json({ error: "proof_url required (upload image first)" }); return;
  }

  const upperPlate = plate.toUpperCase();
  const allowedStatus = new Set(["pending", "confirmed", "rejected"]);
  const safeStatus = allowedStatus.has(status) ? status : "pending";
  const instNo: number | null =
    installment_number == null || installment_number === "" ? null : Number(installment_number);

  // Lookup vehículo
  const { data: v, error: vErr } = await supabase
    .from("vehicles")
    .select("plate, current_driver_id, owner_name")
    .eq("plate", upperPlate)
    .single();

  // @ts-ignore
  if (vErr && vErr.code !== "PGRST116") {
    res.status(500).json({ error: vErr.message }); return;
  }
  if (!v) {
    res.status(400).json({ error: "unknown plate" }); return;
  }

  // Validar upload_id si se proveyó
  let uploadData: any = null;
  if (upload_id) {
    const { data: ud, error: udErr } = await supabase
      .from("receipt_uploads")
      .select("*")
      .eq("id", upload_id)
      .single();
    if (udErr || !ud) {
      res.status(400).json({ error: "Comprobante no encontrado." }); return;
    }
    if (ud.linked_payment_id !== null) {
      res.status(400).json({ error: "Este comprobante ya fue utilizado en otro pago." }); return;
    }
    uploadData = ud;
  }

  // Validación imagen sin conductor
  const isNoDriverImage = uploadData?.ocr_status === "no_driver_image";
  if (isNoDriverImage) {
    const hasDriverAssigned = v.current_driver_id !== null;
    if (hasDriverAssigned) {
      const driverName = (v.owner_name && v.owner_name !== "SIN CONDUCTOR ASIGNADO")
        ? v.owner_name : "el conductor asignado";
      res.status(400).json({
        error: `Si el vehículo no tiene conductor el valor debe ser cero. Por favor desasigne al conductor ${driverName} del vehículo ${upperPlate}.`,
        code: "NO_DRIVER_IMAGE_WITH_DRIVER_OR_AMOUNT",
      }); return;
    }
    if (amt > 0) {
      res.status(400).json({
        error: `Si el vehículo no tiene conductor el valor debe ser cero. Ajusta el monto a $0 para el vehículo ${upperPlate}.`,
        code: "NO_DRIVER_IMAGE_WITH_DRIVER_OR_AMOUNT",
      }); return;
    }
  }

  // Calcular fechas pagables reales para el lote
  let payableDates: string[] = [];
  try {
    const { dates } = await getAmortizationDates(upperPlate, batchStartDate, days_count);
    payableDates = dates;
  } catch (e: any) {
    res.status(500).json({ error: `Error calculando fechas: ${e.message}` }); return;
  }
  if (payableDates.length === 0) {
    res.status(400).json({ error: "No se encontraron fechas pagables para el período solicitado." }); return;
  }

  // Anti-colisión: verificar que ninguna fecha del lote tenga pago activo (bloqueo estricto 409)
  const { data: collision } = await supabase
    .from("payments")
    .select("id, payment_date")
    .eq("plate", upperPlate)
    .in("payment_date", payableDates)
    .in("status", ["pending", "confirmed"])
    .limit(5);

  if (collision && collision.length > 0) {
    const colDates = collision.map((c: any) => c.payment_date).join(", ");
    res.status(409).json({
      code: "BATCH_DATE_COLLISION",
      error: `Ya existen pagos registrados para las fechas: ${colDates}. Por favor revise las fechas del lote.`,
      collision_dates: collision.map((c: any) => c.payment_date),
    }); return;
  }

  const totalBatchAmount = amt * payableDates.length;

  // ---------------- Validación de Comprobante (Lectura DB + Anomalías) ----------------
  let finalReceiptStatus = uploadData?.ocr_status || "unverified";
  let reference_number = uploadData?.reference_number
    ? String(uploadData.reference_number).trim().toUpperCase()
    : null;
  const provider_name = uploadData?.provider_name || null;
  const receipt_date = uploadData?.receipt_date || null;
  let flagDetailsObj: FlagDetails | null = null;

  if (uploadData && (finalReceiptStatus === "verified" || finalReceiptStatus === "unverified")) {
    const warnings: string[] = [];
    let duplicateIds: number[] = [];
    let matchType: "reference" | "amount_date" | undefined;

    // 1. Buscar duplicado por referencia exacta en payments
    if (reference_number) {
      const { data: dupRef } = await supabase
        .from("payments")
        .select("id")
        .eq("reference_number", reference_number)
        .limit(5);

      if (dupRef && dupRef.length > 0) {
        warnings.push("Se detectó otro pago con el mismo número de referencia.");
        duplicateIds = dupRef.map((d: any) => d.id);
        matchType = "reference";
      }
    }

    // 2. Validar que el monto del comprobante coincida con el total del lote
    const ocrAmount = uploadData?.amount ?? null;
    let amountMismatch: { db_amount: number; ocr_amount: number; difference: number } | null = null;
    if (ocrAmount !== null && ocrAmount !== totalBatchAmount) {
      warnings.push(
        `El monto total del lote ($${totalBatchAmount.toLocaleString("es-CO")}) no coincide con el valor del comprobante ($${ocrAmount.toLocaleString("es-CO")}).`
      );
      amountMismatch = { db_amount: totalBatchAmount, ocr_amount: ocrAmount, difference: totalBatchAmount - ocrAmount };
    }

    if (duplicateIds.length > 0 || amountMismatch) {
      flagDetailsObj = {};
      if (duplicateIds.length > 0 && matchType) {
        flagDetailsObj.duplicate_payment_ids = duplicateIds;
        flagDetailsObj.match_type = matchType;
        if (matchType === "reference" && reference_number) {
          flagDetailsObj.matched_reference = reference_number;
        }
      }
      if (amountMismatch) {
        flagDetailsObj.db_amount = amountMismatch.db_amount;
        flagDetailsObj.ocr_amount = amountMismatch.ocr_amount;
        flagDetailsObj.difference = amountMismatch.difference;
      }
    }

    if (warnings.length > 0) {
      if (skip_receipt_check === true) {
        finalReceiptStatus = duplicateIds.length > 0 ? "suspicious_duplicate" : "suspicious_amount_mismatch";
      } else {
        // Bloquear con 409 para que el frontend muestre el modal
        res.status(409).json({
          code: "RECEIPT_WARNING",
          error: warnings.join(" "),
          warnings,
          ocr_reference: reference_number,
          ocr_amount: ocrAmount ?? totalBatchAmount,
          ocr_date: receipt_date,
        });
        return;
      }
    }
  }

  // Obtener cuotas de anticipo operativo a avanzar (SOLO si instNo != null y safeStatus != rejected)
  let advanceUpdates: any[] = [];
  let startingInstallmentNo: number | null = instNo;

  if (instNo != null && safeStatus !== "rejected") {
    const advRes = await getActiveAdvanceByPlateOrError(upperPlate, batchStartDate, null);
    if (advRes.kind === "multiple") {
      res.status(400).json({
        error: "No puede haber más de un préstamo activo por placa. Consulte el encargado.",
      }); return;
    }
    if (advRes.kind === "none") {
      // Sin anticipo activo: no se guardan cuotas de anticipo y se permite el pago sin error
      advanceUpdates = [];
    } else if (advRes.kind === "one") {
      const advance = advRes.advance;
      // Sincronizar cuota inicial con la siguiente cuota real en la base de datos
      const nextDbCuota = (advance.current_installment ?? 0) + 1;
      startingInstallmentNo = nextDbCuota;

      for (let i = 0; i < payableDates.length; i++) {
        const pDate = payableDates[i]!;
        const cuotaNo = nextDbCuota + i;
        if (cuotaNo > (advance.installments ?? 0)) break; // límite de cuotas del préstamo

        const ensured = await ensureScheduleRow({
          advance_id: advance.id,
          start_date: advance.start_date,
          installment_no: cuotaNo,
          payment_date: pDate,
          plate: upperPlate,
          payment_id: null,
          desired_status: "paid",
        });

        if (ensured.ok && ensured.row.status !== "paid") {
          advanceUpdates.push({
            schedule_id: ensured.row.id,
            desired_status: "paid",
            paid_date: pDate,
          });
        }
      }
    }
  }

  // Calcular split por día y construir array para el RPC
  // El comprobante (proof_url, reference_number, upload_id) solo va en el día 1 (índice 0)
  const batchId = randomUUID();
  const batchRows = payableDates.map((date: string, idx: number) => {
    const dayAmt = amt; // misma tarifa para todos los días del lote
    const dayInstNo = startingInstallmentNo != null ? startingInstallmentNo + idx : null;
    const split = dayInstNo != null ? computeInstallmentSplit(dayAmt) : computeBaseSplit(dayAmt);
    const isFirst = idx === 0;
    return {
      payer_name: payer_name.trim(),
      plate: upperPlate,
      driver_id: v.current_driver_id ?? null,
      payment_date: date,
      amount: dayAmt,
      installment_number: dayInstNo,
      proof_url: isFirst ? proof_url : null,
      status: safeStatus,
      insurance_amount: split.insurance,
      maintenance_amount: split.maintenance,
      delivery_amount: split.delivery,
      credit_installment_amount: split.credit,
      installment_status: "installment_status" in split ? (split as any).installment_status : null,
      installment_shortfall: "shortfall" in split ? (split as any).shortfall : null,
      // reference_number ÚNICO solo en la fila 1 (índice único en payments)
      reference_number: isFirst ? (skip_receipt_check ? null : reference_number) : null,
      provider_name: isFirst ? provider_name : null,
      receipt_date: isFirst ? receipt_date : null,
      receipt_status: isFirst ? finalReceiptStatus : "unverified",
      flag_details: isFirst ? flagDetailsObj : null,
      batch_id: batchId,
      batch_index: idx,
      batch_total_days: payableDates.length,
    };
  });

  // Paso 1: Llamar al RPC transaccional (ACID en Postgres)
  const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_payment_batch", {
    p_batch_id: batchId,
    p_payments: batchRows,
    p_advance_updates: advanceUpdates,
  });

  if (rpcErr || !rpcResult?.ok) {
    const errMsg = rpcErr?.message ?? "create_payment_batch RPC falló";
    const status = errMsg.includes("Conflicto de fecha") ? 409 : 500;
    res.status(status).json({ error: errMsg }); return;
  }

  // Obtener IDs insertados
  const insertedIds: number[] = rpcResult.inserted_ids ?? [];
  const primaryPaymentId = insertedIds[0] ?? null;

  // Vincular upload al primer pago (anti-race-condition)
  if (upload_id && primaryPaymentId) {
    const { data: linkedRows, error: linkErr } = await supabase
      .from("receipt_uploads")
      .update({ linked_payment_id: primaryPaymentId })
      .eq("id", upload_id)
      .is("linked_payment_id", null)
      .select();

    if (linkErr || !linkedRows || linkedRows.length === 0) {
      // Race condition: otro pago ya tomó este comprobante. Compensar borrando el lote.
      await supabase.from("payments").delete().eq("batch_id", batchId);
      res.status(400).json({ error: "Este comprobante acaba de ser utilizado en otro pago concurrentemente." }); return;
    }
  }

  // Actualizar current_installment en operational_advances solo si avanzamos cuotas y instNo != null
  if (advanceUpdates.length > 0 && instNo != null) {
    const { data: advData2 } = await supabase
      .from("operational_advances")
      .select("id, current_installment, installments")
      .eq("plate", upperPlate)
      .eq("status", "active")
      .maybeSingle();

    if (advData2) {
      const newCurrent = Math.min(
        (advData2.current_installment ?? 0) + advanceUpdates.length,
        advData2.installments ?? 0
      );
      await supabase
        .from("operational_advances")
        .update({ current_installment: newCurrent })
        .eq("id", advData2.id);

      // Cerrar anticipo si ya no quedan pendientes
      if (newCurrent >= (advData2.installments ?? 0)) {
        await supabase
          .from("operational_advances")
          .update({ status: "closed" })
          .eq("id", advData2.id);
      }
    }
  }

  // Paso 2: Cascada de Leasing (solo si es status confirmed, sin cuota, y hay contrato)
  let leasingInfo: any = undefined;
  if (safeStatus === "confirmed" && instNo == null && primaryPaymentId) {
    const leasingContract = await getActiveLeasingContract(upperPlate);
    if (leasingContract) {
      const totalBatchAmount = amt * payableDates.length;
      const cascadeResult = await applyLeasingPayment(primaryPaymentId, totalBatchAmount, leasingContract.id);
      if (!cascadeResult.ok) {
        // Compensación: si la cascada falla, borrar todo el lote
        await supabase.from("payments").delete().eq("batch_id", batchId);
        if (upload_id) {
          await supabase
            .from("receipt_uploads")
            .update({ linked_payment_id: null })
            .eq("id", upload_id);
        }
        await logInconsistency({
          payment_id: primaryPaymentId,
          plate: upperPlate,
          payment_date: batchStartDate,
          issue_code: "LEASING_CASCADE_ERROR_BATCH_ROLLBACK",
          message: cascadeResult.error ?? "applyLeasingPayment falló en lote — lote revertido",
          metadata: { batch_id: batchId, contract_id: leasingContract.id },
        });
        res.status(500).json({ error: "Error al aplicar la cascada de leasing. El lote fue revertido." }); return;
      }
      leasingInfo = {
        contract_id: leasingContract.id,
        applied: cascadeResult.applied,
        remaining: cascadeResult.remaining,
        cuotas_touched: cascadeResult.cuotasTouched,
        ok: cascadeResult.ok,
      };
    }
  }

  res.status(201).json({
    ok: true,
    batch_id: batchId,
    payment_ids: insertedIds,
    primary_payment_id: primaryPaymentId,
    days_count: payableDates.length,
    payable_dates: payableDates,
    total_amount: amt * payableDates.length,
    advance_installments_updated: advanceUpdates.length,
    leasing: leasingInfo,
  });
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

    // ID del comprobante devuelto por POST /uploads
    upload_id,

    // Cuando el usuario confirma explícitamente a pesar de la alerta de duplicado
    skip_receipt_check,

    // Campos para pago multi-día (lote)
    batch_mode,
    days_count,
    start_date: batch_start_date,
  } = req.body || {};

  // ============================================================
  // Bifurcación: si batch_mode === true, se va al manejador de lote
  // y retorna antes de continuar con el flujo de pago individual.
  // ============================================================
  if (batch_mode === true || (typeof days_count === "number" && days_count > 1)) {
    return handleBatchPayment(req, res);
  }

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
  if (!Number.isFinite(amt) || amt < 0) {
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

  // validar placa existe y obtener el conductor actual + nombre para el mensaje
  const { data: v, error: vErr } = await supabase
    .from("vehicles")
    .select("plate, current_driver_id, owner_name")
    .eq("plate", upperPlate)
    .single();

  // @ts-ignore
  if (vErr && vErr.code !== "PGRST116") {
    return res.status(500).json({ error: vErr.message });
  }
  if (!v) {
    return res.status(400).json({ error: "unknown plate" });
  }

  // ---------------- Validación temprana de comprobante "VEHÍCULO SIN CONDUCTOR" ----------------
  // Se carga uploadData aquí (antes del split) para poder evaluar is_no_driver y la excepción
  // de amt === 0 antes de continuar con el resto del flujo.
  let earlyUploadData: any = null;
  if (upload_id) {
    const { data: _earlyUpload, error: _earlyErr } = await supabase
      .from("receipt_uploads")
      .select("*")
      .eq("id", upload_id)
      .single();

    if (_earlyErr || !_earlyUpload) {
      return res.status(400).json({ error: "Comprobante no encontrado." });
    }
    if (_earlyUpload.linked_payment_id !== null) {
      return res.status(400).json({ error: "Este comprobante ya fue utilizado en otro pago." });
    }
    earlyUploadData = _earlyUpload;
  }

  const isNoDriverImage = earlyUploadData?.ocr_status === "no_driver_image";

  if (isNoDriverImage) {
    // La fuente de verdad para si hay conductor es current_driver_id (no owner_name)
    const hasDriverAssigned = v.current_driver_id !== null;

    if (hasDriverAssigned) {
      // Caso 1: la imagen dice "sin conductor" pero el vehículo aún tiene uno asignado.
      // owner_name solo se usa para componer el mensaje legible al usuario.
      const driverName = (v.owner_name && v.owner_name !== "SIN CONDUCTOR ASIGNADO")
        ? v.owner_name
        : "el conductor asignado";
      return res.status(400).json({
        error: `Si el vehículo no tiene conductor el valor debe ser cero. Por favor desasigne al conductor ${driverName} del vehículo ${upperPlate}.`,
        code: "NO_DRIVER_IMAGE_WITH_DRIVER_OR_AMOUNT",
      });
    }

    if (amt > 0) {
      // Caso 2: el vehículo ya no tiene conductor pero el monto quedó en > $0 por costumbre.
      // No hay nadie que desasignar, solo hay que corregir el valor.
      return res.status(400).json({
        error: `Si el vehículo no tiene conductor el valor debe ser cero. Ajusta el monto a $0 para el vehículo ${upperPlate}.`,
        code: "NO_DRIVER_IMAGE_WITH_DRIVER_OR_AMOUNT",
      });
    }
  }

  // Si no es imagen de VEHÍCULO SIN CONDUCTOR, rechazar $0 como antes
  if (amt === 0 && !isNoDriverImage) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }


  // ---------------- Split siempre ----------------
  const wantsOverride = force_override === true || hasAnyOverride(req.body);

  let splitInsurance = 0;
  let splitMaintenance = 0;
  let splitDelivery = 0;
  let splitCredit = 0;
  let installment_status: InstallmentStatus = null;
  let installment_shortfall: number | null = null;

  // 1) calcular split automático base
  if (instNo == null) {
    const base = computeBaseSplit(amt);
    splitInsurance = base.insurance;
    splitMaintenance = base.maintenance;
    splitDelivery = base.delivery;
    splitCredit = base.credit;
    installment_status = null;
    installment_shortfall = null;
  } else {
    const calc = computeInstallmentSplit(amt);
    splitInsurance = calc.insurance;
    splitMaintenance = calc.maintenance;
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

      // Si hay installment, permitimos que el status sea pagado si el crédito asignado > 0
      if (instNo != null) {
        // status depende de crédito (>0 => paid)
        installment_status = splitCredit > 0 ? "paid" : "pending";
        if (c == null && amt < 70000) {
          installment_shortfall = 70000 - amt;
        } else {
          installment_shortfall = installment_shortfall ?? 0;
        }
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

  // ---------------- Validación de Comprobante (Lectura DB + Anomalías) ----------------
  let finalReceiptStatus = "unverified";
  let receiptWarning = "";
  let reference_number = null;
  let provider_name = null;
  let receipt_date = null;
  let flagDetailsObj: FlagDetails | null = null;

  // Reutilizamos earlyUploadData ya cargado en la validación temprana (Zero-Trust al cliente).
  // No hay una segunda consulta a receipt_uploads; las comprobaciones de "no encontrado" y
  // "ya utilizado" también se evaluaron ahí.
  let uploadData: any = null;
  if (upload_id && earlyUploadData) {
    uploadData = earlyUploadData;

    // Aplicamos normalización por si acaso (aunque OCR ya lo hace)
    reference_number = uploadData.reference_number ? String(uploadData.reference_number).trim().toUpperCase() : null;
    provider_name = uploadData.provider_name;
    receipt_date = uploadData.receipt_date;
    finalReceiptStatus = uploadData.ocr_status || "unverified";
  }

  if (finalReceiptStatus === "verified" || finalReceiptStatus === "unverified") {
    // Recolectamos TODAS las anomalías antes de decidir si bloqueamos
    const warnings: string[] = [];

    // Capturados en memoria ANTES de que reference_number se anule en el insert
    // (ver más abajo), para que ningún pago nuevo quede huérfano de flag_details.
    let duplicateIds: number[] = [];
    let matchType: "reference" | "amount_date" | undefined;

    // 1. Buscar duplicado por referencia exacta (normalizada)
    if (reference_number) {
      const { data: dupRef } = await supabase
        .from("payments")
        .select("id")
        .eq("reference_number", reference_number)
        .limit(5);

      if (dupRef && dupRef.length > 0) {
        warnings.push("Se detectó otro pago con el mismo número de referencia.");
        duplicateIds = dupRef.map((d: any) => d.id);
        matchType = "reference";
      }
    }

    // 2. Si no hay dup por referencia, buscar por monto y fecha idénticos PARA LA MISMA PLACA
    if (warnings.length === 0 && amt > 0 && receipt_date) {
      const { data: dupAmt } = await supabase
        .from("payments")
        .select("id")
        .eq("amount", amt)
        .eq("receipt_date", receipt_date)
        .eq("plate", upperPlate)
        .limit(5);

      if (dupAmt && dupAmt.length > 0) {
        warnings.push("Monto y fecha del comprobante idénticos a otro pago existente para este vehículo.");
        duplicateIds = dupAmt.map((d: any) => d.id);
        matchType = "amount_date";
      }
    }

    // 3. Validar que el monto del comprobante coincida con el monto ingresado
    const ocrAmount = uploadData?.amount ?? null;
    let amountMismatch: { db_amount: number; ocr_amount: number; difference: number } | null = null;
    if (ocrAmount !== null && ocrAmount !== amt) {
      warnings.push(
        `El monto ingresado ($${amt.toLocaleString("es-CO")}) no coincide con el valor del comprobante ($${ocrAmount.toLocaleString("es-CO")}).`
      );
      amountMismatch = { db_amount: amt, ocr_amount: ocrAmount, difference: amt - ocrAmount };
    }

    if (duplicateIds.length > 0 || amountMismatch) {
      flagDetailsObj = {};
      if (duplicateIds.length > 0 && matchType) {
        flagDetailsObj.duplicate_payment_ids = duplicateIds;
        flagDetailsObj.match_type = matchType;
        if (matchType === "reference" && reference_number) {
          flagDetailsObj.matched_reference = reference_number;
        }
      }
      if (amountMismatch) {
        flagDetailsObj.db_amount = amountMismatch.db_amount;
        flagDetailsObj.ocr_amount = amountMismatch.ocr_amount;
        flagDetailsObj.difference = amountMismatch.difference;
      }
    }

    if (warnings.length > 0) {
      if (skip_receipt_check === true) {
        // El usuario confirmó: marcamos como sospechoso y continuamos.
        // Distinguimos la causa real: solo es "duplicado" si de verdad hay
        // OTRO pago específico con el que hace match (referencia o
        // monto+fecha). Si el único problema es que el monto leído por OCR
        // no coincide con el ingresado, NO es un duplicado — etiquetarlo así
        // es engañoso porque no hay ningún otro comprobante que mostrar.
        finalReceiptStatus = duplicateIds.length > 0 ? "suspicious_duplicate" : "suspicious_amount_mismatch";
        receiptWarning = warnings.join(" | ");
      } else {
        // Primera vez: bloqueamos con 409 para que el frontend muestre el modal
        return res.status(409).json({
          code: "RECEIPT_WARNING",
          error: warnings.join(" "),
          warnings,
          ocr_reference: reference_number,
          ocr_amount: ocrAmount ?? amt,
          ocr_date: receipt_date,
        });
      }
    }
  } else if (finalReceiptStatus === "suspicious_ocr_failed" || finalReceiptStatus === "timeout") {
    receiptWarning = "El comprobante no pudo ser leído claramente o hubo un error en la validación automática.";
  }


  // ---------------- Insert payment ----------------
  const insertPayload: any = {
    payer_name: payer_name.trim(),
    plate: upperPlate,
    driver_id: v.current_driver_id || null, // Se inyecta el ID del conductor activo
    payment_date,
    amount: amt,
    installment_number: instNo,
    proof_url: proof_url ?? null,
    status: safeStatus,

    insurance_amount: splitInsurance,
    maintenance_amount: splitMaintenance,
    delivery_amount: splitDelivery,
    credit_installment_amount: splitCredit,
    installment_status: installment_status,
    installment_shortfall: installment_shortfall,
    
    // Si el usuario confirmó un duplicado, anulamos reference_number para no colisionar
    // con el índice UNIQUE de la DB. Los datos OCR quedan en receipt_uploads para auditoría.
    reference_number: (skip_receipt_check === true) ? null : (reference_number || null),
    provider_name: provider_name || null,
    receipt_date: receipt_date || null,
    receipt_status: finalReceiptStatus,
    flag_details: flagDetailsObj,
  };

  const { data: payment, error: insErr } = await supabase
    .from("payments")
    .insert([insertPayload])
    .select()
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      return res.status(400).json({ error: "Este comprobante ya fue registrado (Número de referencia duplicado)." });
    }
    return res.status(500).json({ error: insErr.message });
  }

  // ---------------- Update receipt_uploads linked_payment_id (Atomically) ----------------
  if (upload_id) {
    const { data: linkedRows, error: linkErr } = await supabase
      .from("receipt_uploads")
      .update({ linked_payment_id: payment.id })
      .eq("id", upload_id)
      .is("linked_payment_id", null)
      .select();
      
    if (linkErr || !linkedRows || linkedRows.length === 0) {
      // Race condition detected! Another payment already claimed this upload_id concurrently.
      // We must rollback this payment.
      await supabase.from("payments").delete().eq("id", payment.id);
      return res.status(400).json({ error: "Este comprobante acaba de ser utilizado en otro pago concurrentemente." });
    }
  }

  // ========= ROUTER / STRATEGY: Leasing vs. Renting Legacy =========
  // Si el vehículo tiene un contrato activo de leasing Y NO ES UN PAGO DE ANTICIPO,
  // se desvía la lógica de distribución al nuevo módulo. El flujo legacy queda 100% intacto.
  // amt > 0 garantiza que registros en $0 (vehículo sin conductor) no toquen la cascada de leasing.
  if (safeStatus === "confirmed" && instNo == null && amt > 0) {
    const leasingContract = await getActiveLeasingContract(upperPlate);
    if (leasingContract) {
      const cascadeResult = await applyLeasingPayment(payment.id, amt, leasingContract.id);
      if (!cascadeResult.ok) {
        // Loguear el error pero no revertir el payment (ya está registrado)
        await logInconsistency({
          payment_id: payment.id,
          plate: upperPlate,
          payment_date,
          issue_code: "LEASING_CASCADE_ERROR",
          message: cascadeResult.error ?? "applyLeasingPayment failed",
          metadata: { contract_id: leasingContract.id, amount: amt },
        });
      }
      // Retornar temprano: el pago de leasing no toca operational_advance_schedule
      return res.status(201).json({
        ...payment,
        leasing: {
          contract_id:  leasingContract.id,
          applied:      cascadeResult.applied,
          remaining:    cascadeResult.remaining,
          cuotas_touched: cascadeResult.cuotasTouched,
          ok:           cascadeResult.ok,
          warning:      cascadeResult.ok ? undefined : cascadeResult.error,
        },
        receiptWarning: receiptWarning || undefined,
      });
    }
  }
  // ======= Fin del bloque Leasing — el código legacy continúa sin cambios =======

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

  return res.status(201).json({
    ...payment,
    warning: receiptWarning || undefined
  });
});

// -------------------- GET /payments/flagged --------------------
// Retorna pagos marcados para revisión manual con filtros opcionales.
// Query params: plate, driver_id, date_from, date_to, flag_reason, issue_type, limit, offset
//
// issue_type separa las dos clases de problema, que tienen tamaños muy
// distintos y no deben mezclarse en una misma página paginada: 'duplicate'
// (operacional, receipt_status='suspicious_duplicate' o flagged_for_review) —
// lo único que tiene un comprobante específico que mostrar — vs 'technical'
// (falla de OCR: 'suspicious_ocr_failed'/'timeout', sin comprobante en conflicto).
r.get("/flagged", async (req: Request, res: Response) => {
  const rawLimit = parseInt(String(req.query.limit || "50"), 10);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 50 : rawLimit, 500));
  const rawOffset = parseInt(String(req.query.offset || "0"), 10);
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

  const plate      = String(req.query.plate       || "").toUpperCase().trim();
  const driver_id  = String(req.query.driver_id   || "").trim();
  const date_from  = String(req.query.date_from   || "").trim();
  const date_to    = String(req.query.date_to     || "").trim();
  const flag_reason = String(req.query.flag_reason || "").trim();
  const issue_type  = String(req.query.issue_type  || "").trim();

  if (plate && !PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "invalid plate (expected ABC123)" });
  }
  if (date_from && !isISODate(date_from)) {
    return res.status(400).json({ error: "date_from must be YYYY-MM-DD" });
  }
  if (date_to && !isISODate(date_to)) {
    return res.status(400).json({ error: "date_to must be YYYY-MM-DD" });
  }

  const allowedReasons = new Set(["duplicate_reference", "duplicate_amount_date", "amount_mismatch", ""]);
  if (!allowedReasons.has(flag_reason)) {
    return res.status(400).json({ error: "invalid flag_reason" });
  }

  const allowedIssueTypes = new Set(["duplicate", "technical", ""]);
  if (!allowedIssueTypes.has(issue_type)) {
    return res.status(400).json({ error: "invalid issue_type (expected duplicate or technical)" });
  }

  let q = supabase
    .from("payments")
    .select(`
      id, plate, payment_date, amount, status, proof_url,
      reference_number, flag_reason, flagged_for_review, flag_details,
      payer_name, receipt_status, receipt_date,
      drivers (id, full_name)
    `, { count: "exact" });

  if (issue_type === "duplicate") {
    q = q.or("receipt_status.eq.suspicious_duplicate,flagged_for_review.eq.true");
  } else if (issue_type === "technical") {
    q = q.in("receipt_status", ["suspicious_ocr_failed", "timeout"]);
  } else {
    q = q.or(suspiciousOnlyFilter());
  }

  q = q.order("payment_date", { ascending: false }).range(offset, offset + limit - 1);

  if (plate)       q = q.eq("plate", plate);
  if (driver_id)   q = q.eq("driver_id", driver_id);
  if (date_from)   q = q.gte("payment_date", date_from);
  if (date_to)     q = q.lte("payment_date", date_to);
  if (flag_reason) q = q.eq("flag_reason", flag_reason);

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const rawItems = data ?? [];

  // Resolver en 1 query batch los pagos duplicados referenciados en flag_details
  // de esta página, para evitar N+1 queries.
  const duplicateIds = collectDuplicateIds(rawItems.map((p: any) => p.flag_details as FlagDetails | null));
  const duplicateResolver = new Map<number, DuplicatePaymentSummary>();
  if (duplicateIds.size > 0) {
    const { data: dupRows } = await supabase
      .from("payments")
      .select("id, plate, payment_date, amount, reference_number, proof_url")
      .in("id", [...duplicateIds]);
    for (const row of dupRows ?? []) duplicateResolver.set(row.id, row as DuplicatePaymentSummary);
  }

  // Aplanar el join de drivers y enriquecer con clasificación + flag_details resuelto.
  const items = rawItems.map((p: any) => {
    const classification = classifyReceipt(p.receipt_status, p.flagged_for_review, p.flag_reason);
    const duplicate_payments = buildDuplicatePayments(p.flag_details, duplicateResolver);
    return {
      ...p,
      driver_name: p.drivers?.full_name ?? null,
      drivers: undefined,
      ...classification,
      inconsistency_reasons: refineReasonsForEvidence(
        classification.inconsistency_reasons,
        !!duplicate_payments && duplicate_payments.length > 0,
      ),
      duplicate_payments,
      amount_mismatch: buildAmountMismatch(p.flag_details),
      match_context: buildMatchContext(p.flag_details),
    };
  });

  return res.json({ items, total: count ?? 0, limit, offset });
});

// -------------------- GET /payments (igual que antes) --------------------

r.get("/", async (req: Request, res: Response) => {
  const rawLimit = parseInt(String(req.query.limit || "10"), 10);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 10 : rawLimit, 1000));

  const rawOffset = parseInt(String(req.query.offset || "0"), 10);
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

  const plate          = String(req.query.plate         || "").toUpperCase().trim();
  const month          = String(req.query.month         || "").trim(); // YYYY-MM
  const suspiciousOnly = String(req.query.suspicious_only || "false") === "true";

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

  if (suspiciousOnly) q = q.or(suspiciousOnlyFilter());

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const rawItems = data ?? [];

  // Resolver en 1 query batch los pagos duplicados referenciados en flag_details
  // de esta página, para evitar N+1 queries.
  const duplicateIds = collectDuplicateIds(rawItems.map((p: any) => p.flag_details as FlagDetails | null));
  const duplicateResolver = new Map<number, DuplicatePaymentSummary>();
  if (duplicateIds.size > 0) {
    const { data: dupRows } = await supabase
      .from("payments")
      .select("id, plate, payment_date, amount, reference_number, proof_url")
      .in("id", [...duplicateIds]);
    for (const row of dupRows ?? []) duplicateResolver.set(row.id, row as DuplicatePaymentSummary);
  }

  // Enrich each payment with derived classification fields.
  const items = rawItems.map((p: any) => {
    const classification = classifyReceipt(p.receipt_status, p.flagged_for_review, p.flag_reason);
    const duplicate_payments = buildDuplicatePayments(p.flag_details, duplicateResolver);
    return {
      ...p,
      ...classification,
      inconsistency_reasons: refineReasonsForEvidence(
        classification.inconsistency_reasons,
        !!duplicate_payments && duplicate_payments.length > 0,
      ),
      duplicate_payments,
      amount_mismatch: buildAmountMismatch(p.flag_details),
      match_context: buildMatchContext(p.flag_details),
    };
  });

  return res.json({ items, total: count ?? 0, limit, offset });
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
// -------------------- DELETE /last/:plate (Undo Last Payment) --------------------
r.delete("/last/:plate", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase().trim();
  if (!PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "invalid plate" });
  }

  // 1. Buscar el pago más reciente
  const { data: lastPayment, error: fetchErr } = await supabase
    .from("payments")
    .select("*")
    .eq("plate", plate)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // @ts-ignore
  if (fetchErr && fetchErr.code !== "PGRST116") {
    return res.status(500).json({ error: fetchErr.message });
  }
  if (!lastPayment) {
    return res.status(404).json({ error: "no payments found for this plate" });
  }

  const { id: payment_id, installment_number, batch_id } = lastPayment;

  // ============================================================
  // 2A. Si el pago pertenece a un LOTE — revertir el lote completo
  // ============================================================
  if (batch_id) {
    // Obtener todas las filas del lote
    const { data: batchRows, error: batchFetchErr } = await supabase
      .from("payments")
      .select("*")
      .eq("batch_id", batch_id)
      .order("batch_index", { ascending: true });

    if (batchFetchErr) {
      return res.status(500).json({ error: batchFetchErr.message });
    }

    const rows = batchRows ?? [];
    const deletedIds = rows.map((r: any) => r.id);

    // Revertir cuotas de anticipo operativo (solo las que estaban paid por este lote)
    if (rows.some((r: any) => r.installment_number != null)) {
      const { data: latestAdvance } = await supabase
        .from("operational_advances")
        .select("id, status, current_installment")
        .eq("plate", plate)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestAdvance) {
        // Revertir cada cuota del lote que tenga installment_number
        for (const row of rows) {
          if (row.installment_number != null) {
            await supabase
              .from("operational_advance_schedule")
              .update({ status: "pending", paid_date: null })
              .eq("advance_id", latestAdvance.id)
              .eq("installment_no", row.installment_number)
              .neq("status", "pending"); // No revertir lo que ya estaba pendiente
          }
        }

        // Reabrir anticipo si estaba cerrado
        if (latestAdvance.status === "closed") {
          await supabase
            .from("operational_advances")
            .update({ status: "active" })
            .eq("id", latestAdvance.id);
        }

        // Ajustar current_installment hacia atrás
        const cuotasEnLote = rows.filter((r: any) => r.installment_number != null).length;
        const newCurrent = Math.max(0, (latestAdvance.current_installment ?? 0) - cuotasEnLote);
        await supabase
          .from("operational_advances")
          .update({ current_installment: newCurrent })
          .eq("id", latestAdvance.id);
      }
    }

    // Revertir receipt_upload si estaba vinculado al primer pago
    const firstRow = rows.find((r: any) => r.batch_index === 0);
    if (firstRow) {
      await supabase
        .from("receipt_uploads")
        .update({ linked_payment_id: null })
        .eq("linked_payment_id", firstRow.id);
    }

    // Borrar todas las filas del lote
    const { error: delBatchErr } = await supabase
      .from("payments")
      .delete()
      .eq("batch_id", batch_id);

    if (delBatchErr) {
      return res.status(500).json({ error: delBatchErr.message });
    }

    await logInconsistency({
      payment_id: null,
      plate,
      payment_date: lastPayment.payment_date,
      issue_code: "PAYMENT_BATCH_HARD_DELETED",
      message: `Usuario borró lote completo (${rows.length} pagos) via rollback.`,
      metadata: { batch_id, deleted_ids: deletedIds, amount_each: lastPayment.amount },
    });

    return res.json({ success: true, batch_id, deleted_ids: deletedIds, deleted_count: deletedIds.length });
  }

  // ============================================================
  // 2B. Pago individual (flujo legacy sin cambios)
  // ============================================================
  // Si tiene cuota asociada, hacer rollback del schedule
  if (installment_number != null) {
    // Buscar el préstamo más reciente de esta placa
    const { data: latestAdvance, error: advErr } = await supabase
      .from("operational_advances")
      .select("id, status")
      .eq("plate", plate)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!advErr && latestAdvance) {
      // Revertir el schedule a pending
      await supabase
        .from("operational_advance_schedule")
        .update({ status: "pending", paid_date: null })
        .eq("advance_id", latestAdvance.id)
        .eq("installment_no", installment_number);

      // Si el préstamo estaba cerrado, reabrirlo
      if (latestAdvance.status === "closed") {
        await supabase
          .from("operational_advances")
          .update({ status: "active" })
          .eq("id", latestAdvance.id);
      }
    }
  }

  // 3. Borrar físicamente el pago
  const { error: delErr } = await supabase
    .from("payments")
    .delete()
    .eq("id", payment_id);

  if (delErr) {
    return res.status(500).json({ error: delErr.message });
  }

  await logInconsistency({
    payment_id: null,
    plate: plate,
    payment_date: lastPayment.payment_date,
    issue_code: "PAYMENT_HARD_DELETED",
    message: "User explicitly deleted the most recent payment via UI rollback.",
    metadata: { deleted_id: payment_id, amount: lastPayment.amount }
  });

  return res.json({ success: true, deleted_id: payment_id });
});

export default r;
