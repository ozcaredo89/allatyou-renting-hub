// src/lib/leasingCascade.ts
// =============================================================================
// Servicio de Cascada de Pagos para contratos Leasing / Rent-to-Own
// ACID: Usa transacciones Supabase RPC o múltiples operaciones atómicas
// =============================================================================
import { supabase } from "./supabase";

// --------------------------------------------------------------------------
// Tipos
// --------------------------------------------------------------------------

export type LeasingContract = {
  id: number;
  plate: string;
  driver_id: number | null;
  purchase_price: number;
  down_payment: number;
  financed_capital: number;
  monthly_rate_pct: number;
  daily_maintenance: number;
  daily_admin: number;
  start_date: string;
  status: "active" | "closed" | "default";
  start_date_pending_confirmation?: boolean;
};

type ScheduleRow = {
  id: number;
  contract_id: number;
  installment_no: number;
  due_date: string;
  maintenance_expected: number;
  admin_expected: number;
  interest_expected: number;
  principal_expected: number;
  total_expected: number;
  maintenance_paid: number;
  admin_paid: number;
  interest_paid: number;
  principal_paid: number;
  status: "pending" | "partially_paid" | "paid";
};

type CascadeResult = {
  ok: boolean;
  applied: number;          // total de dinero distribuido
  remaining: number;        // sobrante sin aplicar
  distributionsInserted: number;
  cuotasTouched: number;
  error?: string;
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function toNum(v: any): number {
  return Math.round(Number(v) * 100) / 100;
}

// --------------------------------------------------------------------------
// Buscar el contrato de leasing activo para una placa
// Retorna null si no existe (vehículo es renting normal)
// --------------------------------------------------------------------------
export async function getActiveLeasingContract(
  plate: string
): Promise<LeasingContract | null> {
  const { data, error } = await supabase
    .from("leasing_contracts")
    .select("*")
    .eq("plate", plate.toUpperCase())
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    plate: data.plate,
    driver_id: data.driver_id,
    purchase_price: toNum(data.purchase_price),
    down_payment: toNum(data.down_payment),
    financed_capital: toNum(data.financed_capital),
    monthly_rate_pct: toNum(data.monthly_rate_pct),
    daily_maintenance: toNum(data.daily_maintenance),
    daily_admin: toNum(data.daily_admin),
    start_date: data.start_date,
    status: data.status,
    start_date_pending_confirmation: !!data.start_date_pending_confirmation,
  };
}

// --------------------------------------------------------------------------
// CASCADA DE PAGOS — función principal
// Distribuye `amount` sobre las cuotas del contrato en orden estricto de
// prelación: Mantenimiento → Admin → Interés → Capital
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// CASCADA DE PAGOS — función principal
// Aplica el pago a la cuota que coincide en fecha (due_date = payment_date).
// Si net_amount >= cuota, cubre la cuota al 100% y etiqueta cualquier sobrante como LEASING_EXCESS_PAYMENT.
// Si no coincide en fecha o monto es insuficiente, no aplica y registra alerta en payment_inconsistencies.
// --------------------------------------------------------------------------
export async function applyLeasingPayment(
  paymentId: number,
  amount: number,
  contractId: number,
  targetScheduleId?: number
): Promise<CascadeResult> {
  // 1. Obtener detalles del pago
  const { data: payment, error: pErr } = await supabase
    .from("payments")
    .select("id, plate, payment_date, amount, status")
    .eq("id", paymentId)
    .single();

  if (pErr || !payment) {
    return { ok: false, applied: 0, remaining: amount, distributionsInserted: 0, cuotasTouched: 0, error: `Pago #${paymentId} no encontrado` };
  }

  // 2. Verificar si el contrato tiene fecha pendiente de confirmación
  const { data: contract } = await supabase
    .from("leasing_contracts")
    .select("id, start_date_pending_confirmation")
    .eq("id", contractId)
    .single();

  if (contract?.start_date_pending_confirmation) {
    return {
      ok: false,
      applied: 0,
      remaining: Number(payment.amount),
      distributionsInserted: 0,
      cuotasTouched: 0,
      error: "CONTRACT_START_DATE_PENDING_CONFIRMATION",
    };
  }

  // 3. Monto total del pago
  const totalAmount = Number(payment.amount);

  // Si monto <= 1 -> día de mantenimiento / taller
  if (totalAmount <= 1) {
    return { ok: true, applied: 0, remaining: 0, distributionsInserted: 0, cuotasTouched: 0 };
  }

  // 4. Chequeo de duplicados confirmados en la misma fecha para la misma placa
  const { data: dups } = await supabase
    .from("payments")
    .select("id")
    .eq("plate", payment.plate)
    .eq("payment_date", payment.payment_date)
    .eq("status", "confirmed")
    .neq("id", paymentId)
    .limit(1);

  if (dups && dups.length > 0) {
    await supabase.from("payment_inconsistencies").insert([{
      payment_id: paymentId,
      plate: payment.plate,
      payment_date: payment.payment_date,
      issue_code: "LEASING_DUPLICATE_PAYMENT",
      message: "Ya existe otro pago confirmado registrado para esta placa en la misma fecha",
      metadata: { amount: totalAmount, duplicate_id: dups[0]?.id }
    }]);
    return { ok: false, applied: 0, remaining: totalAmount, distributionsInserted: 0, cuotasTouched: 0, error: "LEASING_DUPLICATE_PAYMENT" };
  }

  // 5. Buscar cuota en cronograma (targetScheduleId si se especifica explícitamente desde conciliación manual, o por due_date = payment_date)
  let cuota: any = null;
  let cErr: any = null;

  if (targetScheduleId) {
    const res = await supabase
      .from("leasing_schedule")
      .select("*")
      .eq("id", targetScheduleId)
      .eq("contract_id", contractId)
      .maybeSingle();
    cuota = res.data;
    cErr = res.error;
  } else {
    const res = await supabase
      .from("leasing_schedule")
      .select("*")
      .eq("contract_id", contractId)
      .eq("due_date", payment.payment_date)
      .maybeSingle();
    cuota = res.data;
    cErr = res.error;
  }

  if (cErr || !cuota) {
    await supabase.from("payment_inconsistencies").insert([{
      payment_id: paymentId,
      plate: payment.plate,
      payment_date: payment.payment_date,
      issue_code: "LEASING_DATE_MISMATCH",
      message: "No existe cuota en el cronograma para esta fecha (festivo o día no hábil)",
      metadata: { amount: totalAmount }
    }]);
    return { ok: false, applied: 0, remaining: totalAmount, distributionsInserted: 0, cuotasTouched: 0, error: "LEASING_DATE_MISMATCH" };
  }

  // 6. Verificar si la cuota ya está pagada
  if (cuota.status === "paid") {
    await supabase.from("payment_inconsistencies").insert([{
      payment_id: paymentId,
      plate: payment.plate,
      payment_date: payment.payment_date,
      issue_code: "LEASING_INSTALLMENT_ALREADY_PAID",
      message: "La cuota correspondiente a esta fecha ya fue pagada previamente",
      metadata: { amount: totalAmount, installment_no: cuota.installment_no, cuota_id: cuota.id }
    }]);
    return { ok: false, applied: 0, remaining: totalAmount, distributionsInserted: 0, cuotasTouched: 0, error: "LEASING_INSTALLMENT_ALREADY_PAID" };
  }

  // 7. Calcular saldo libre disponible del pago
  const { data: existingDists } = await supabase
    .from("payment_distributions")
    .select("amount_applied")
    .eq("payment_id", paymentId);
  const alreadyApplied = (existingDists || []).reduce((s: number, d: any) => s + Number(d.amount_applied), 0);
  const availableAmount = totalAmount - alreadyApplied;

  if (availableAmount <= 0) {
    return { ok: false, applied: 0, remaining: 0, distributionsInserted: 0, cuotasTouched: 0, error: "PAYMENT_ALREADY_DISTRIBUTED" };
  }

  // 8. Comparar faltante vs disponible
  const faltaMant  = Math.max(0, toNum(cuota.maintenance_expected) - toNum(cuota.maintenance_paid));
  const faltaAdmin = Math.max(0, toNum(cuota.admin_expected)       - toNum(cuota.admin_paid));
  const faltaInt   = Math.max(0, toNum(cuota.interest_expected)    - toNum(cuota.interest_paid));
  const faltaCap   = Math.max(0, toNum(cuota.principal_expected)   - toNum(cuota.principal_paid));
  const faltaTotal = faltaMant + faltaAdmin + faltaInt + faltaCap;

  if (availableAmount < faltaTotal - 1.0) {
    // Monto insuficiente
    await supabase.from("payment_inconsistencies").insert([{
      payment_id: paymentId,
      plate: payment.plate,
      payment_date: payment.payment_date,
      issue_code: "LEASING_AMOUNT_MISMATCH",
      message: "Monto neto insuficiente para cubrir la cuota del día",
      metadata: { amount: availableAmount, falta: faltaTotal, installment_no: cuota.installment_no }
    }]);
    return { ok: false, applied: 0, remaining: availableAmount, distributionsInserted: 0, cuotasTouched: 0, error: "LEASING_AMOUNT_MISMATCH" };
  }

  // 9. Ejecutar match atómico via RPC
  const { error: rpcErr } = await supabase.rpc("match_leasing_payment", {
    p_schedule_id: cuota.id,
    p_payment_id: paymentId,
    p_maint_applied: faltaMant,
    p_admin_applied: faltaAdmin,
    p_int_applied: faltaInt,
    p_prin_applied: faltaCap,
    p_notes: "Cascada automática",
  });

  if (rpcErr) {
    return { ok: false, applied: 0, remaining: availableAmount, distributionsInserted: 0, cuotasTouched: 0, error: rpcErr.message };
  }

  // 10. Si hubo excedente, etiquetar LEASING_EXCESS_PAYMENT
  if (availableAmount > faltaTotal + 1.0) {
    const excess = availableAmount - faltaTotal;
    await supabase.from("payment_inconsistencies").insert([{
      payment_id: paymentId,
      plate: payment.plate,
      payment_date: payment.payment_date,
      issue_code: "LEASING_EXCESS_PAYMENT",
      message: `Pago excedente de $${Math.round(excess).toLocaleString("es-CO")} COP`,
      metadata: {
        excess_amount: Math.round(excess),
        cuota_id: cuota.id,
        installment_no: cuota.installment_no,
        amount_paid: availableAmount,
        quota_expected: faltaTotal,
      }
    }]);
  }

  const distributionsCount = (faltaMant > 0 ? 1 : 0) + (faltaAdmin > 0 ? 1 : 0) + (faltaInt > 0 ? 1 : 0) + (faltaCap > 0 ? 1 : 0);

  return {
    ok: true,
    applied: faltaTotal,
    remaining: availableAmount - faltaTotal,
    distributionsInserted: distributionsCount,
    cuotasTouched: 1,
  };
}


// --------------------------------------------------------------------------
// Cierre automático de contrato si todas las cuotas están pagadas
// --------------------------------------------------------------------------
async function maybeCloseContract(contractId: number): Promise<void> {
  const { data: open } = await supabase
    .from("leasing_schedule")
    .select("id")
    .eq("contract_id", contractId)
    .neq("status", "paid")
    .limit(1);

  if ((open ?? []).length === 0) {
    await supabase
      .from("leasing_contracts")
      .update({ status: "closed" })
      .eq("id", contractId);

    // Retornar el vehículo al estado 'active' (ya propio del conductor)
    const { data: contract } = await supabase
      .from("leasing_contracts")
      .select("plate")
      .eq("id", contractId)
      .single();

    if (contract?.plate) {
      await supabase
        .from("vehicles")
        .update({ status: "active" })
        .eq("plate", contract.plate);
    }
  }
}

// --------------------------------------------------------------------------
// Generador de cronograma diario (usa el mismo algoritmo del simulador)
// Se llama desde el endpoint POST /leasing/contracts al crear el contrato.
// --------------------------------------------------------------------------
export function generateLeasingSchedule(
  contractId: number,
  financedCapital: number,
  monthlyRatePct: number,
  dailyMaintenance: number,
  dailyAdmin: number,
  dailyCapitalInterest: number,
  startDate: string,
  validPaymentDates: Set<string>  // fechas pagables (sin P&P), puede ser vacío
): Array<Record<string, any>> {
  const dailyRate = (monthlyRatePct * 12) / 365 / 100;
  let currentBalance = financedCapital;
  let installmentNo = 0;
  const schedule: Array<Record<string, any>> = [];

  let current = new Date(startDate + "T00:00:00Z");
  const MAX_DAYS = 365 * 15; // 15 años max de seguridad (igual al simulador)
  let dayCount = 0;

  while (currentBalance > 0.01 && dayCount < MAX_DAYS) {
    const iso = current.toISOString().slice(0, 10);
    const dailyInterest = currentBalance * dailyRate;
    const isPayDay = validPaymentDates.size === 0 || validPaymentDates.has(iso);

    if (isPayDay) {
      installmentNo++;
      // Igual que el simulador: paymentToApply cubre capital + interés
      const paymentToApply = Math.min(dailyCapitalInterest, currentBalance + dailyInterest);
      const principalPaid = paymentToApply - dailyInterest;
      currentBalance -= principalPaid;

      schedule.push({
        contract_id:          contractId,
        installment_no:       installmentNo,
        due_date:             iso,
        maintenance_expected: Math.round(dailyMaintenance * 100) / 100,
        admin_expected:       Math.round(dailyAdmin * 100) / 100,
        interest_expected:    Math.round(dailyInterest * 100) / 100,
        principal_expected:   Math.round(principalPaid * 100) / 100,
        balance_expected:     Math.round((currentBalance > 0 ? currentBalance : 0) * 100) / 100,
        status:               "pending",
      });
    } else {
      // En días no hábiles (P&P, festivo, descanso), el interés se capitaliza en el saldo de deuda
      currentBalance += dailyInterest;
    }

    current.setUTCDate(current.getUTCDate() + 1);
    dayCount++;
  }

  return schedule;
}
