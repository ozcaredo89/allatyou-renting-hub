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
  };
}

// --------------------------------------------------------------------------
// CASCADA DE PAGOS — función principal
// Distribuye `amount` sobre las cuotas del contrato en orden estricto de
// prelación: Mantenimiento → Admin → Interés → Capital
// --------------------------------------------------------------------------
export async function applyLeasingPayment(
  paymentId: number,
  amount: number,
  contractId: number
): Promise<CascadeResult> {
  let remaining = Math.round(amount);
  let distributionsInserted = 0;
  let cuotasTouched = 0;

  if (remaining <= 0) {
    return { ok: false, applied: 0, remaining: 0, distributionsInserted: 0, cuotasTouched: 0, error: "amount must be > 0" };
  }

  // 1. Obtener cuotas pendientes o parcialmente pagadas, ordenadas por fecha
  const { data: rows, error: fetchErr } = await supabase
    .from("leasing_schedule")
    .select("*")
    .eq("contract_id", contractId)
    .in("status", ["pending", "partially_paid"])
    .order("due_date", { ascending: true })
    .order("installment_no", { ascending: true });

  if (fetchErr) {
    return {
      ok: false, applied: 0, remaining, distributionsInserted: 0, cuotasTouched: 0,
      error: `Error cargando cronograma: ${fetchErr.message}`,
    };
  }

  const schedule = (rows ?? []) as ScheduleRow[];

  if (schedule.length === 0) {
    return { ok: true, applied: 0, remaining, distributionsInserted: 0, cuotasTouched: 0 };
  }

  const totalApplied = amount - remaining; // se calculará al final

  // 2. Iterar cuota por cuota, aplicando la cascada
  for (const cuota of schedule) {
    if (remaining <= 0) break;
    cuotasTouched++;

    // Calcular faltante por rubro
    const faltaMant  = Math.max(0, toNum(cuota.maintenance_expected) - toNum(cuota.maintenance_paid));
    const faltaAdmin = Math.max(0, toNum(cuota.admin_expected)       - toNum(cuota.admin_paid));
    const faltaInt   = Math.max(0, toNum(cuota.interest_expected)    - toNum(cuota.interest_paid));
    const faltaCap   = Math.max(0, toNum(cuota.principal_expected)   - toNum(cuota.principal_paid));

    // Calcular abonos según orden de prelación
    const abonoMant  = Math.min(faltaMant,  remaining); remaining -= abonoMant;
    const abonoAdmin = Math.min(faltaAdmin, remaining); remaining -= abonoAdmin;
    const abonoInt   = Math.min(faltaInt,   remaining); remaining -= abonoInt;
    const abonoCap   = Math.min(faltaCap,   remaining); remaining -= abonoCap;

    // Construir distribuciones (solo las que tienen monto > 0)
    const distribuciones: Array<{ payment_id: number; schedule_id: number; bucket: string; amount_applied: number }> = [];
    if (abonoMant  > 0) distribuciones.push({ payment_id: paymentId, schedule_id: cuota.id, bucket: "maintenance", amount_applied: abonoMant });
    if (abonoAdmin > 0) distribuciones.push({ payment_id: paymentId, schedule_id: cuota.id, bucket: "admin",       amount_applied: abonoAdmin });
    if (abonoInt   > 0) distribuciones.push({ payment_id: paymentId, schedule_id: cuota.id, bucket: "interest",    amount_applied: abonoInt });
    if (abonoCap   > 0) distribuciones.push({ payment_id: paymentId, schedule_id: cuota.id, bucket: "principal",   amount_applied: abonoCap });

    if (distribuciones.length === 0) continue;

    // 2a. Insertar distribuciones en payment_distributions
    const { error: distErr } = await supabase
      .from("payment_distributions")
      .insert(distribuciones);

    if (distErr) {
      return {
        ok: false, applied: amount - remaining, remaining, distributionsInserted, cuotasTouched,
        error: `Error insertando distribución cuota #${cuota.installment_no}: ${distErr.message}`,
      };
    }
    distributionsInserted += distribuciones.length;

    // 2b. Calcular nuevos acumulados de la cuota
    const newMaintPaid  = toNum(cuota.maintenance_paid) + abonoMant;
    const newAdminPaid  = toNum(cuota.admin_paid)       + abonoAdmin;
    const newIntPaid    = toNum(cuota.interest_paid)    + abonoInt;
    const newCapPaid    = toNum(cuota.principal_paid)   + abonoCap;

    // Determinar nuevo estado
    const totalExpected = toNum(cuota.maintenance_expected) + toNum(cuota.admin_expected) +
                          toNum(cuota.interest_expected)    + toNum(cuota.principal_expected);
    const totalPaid     = newMaintPaid + newAdminPaid + newIntPaid + newCapPaid;

    // La cuota solo es 'paid' si los 4 rubros están cubiertos al 100%
    const allCovered =
      newMaintPaid  >= toNum(cuota.maintenance_expected) &&
      newAdminPaid  >= toNum(cuota.admin_expected)       &&
      newIntPaid    >= toNum(cuota.interest_expected)    &&
      newCapPaid    >= toNum(cuota.principal_expected);

    const newStatus: "paid" | "partially_paid" = allCovered ? "paid" : "partially_paid";

    // 2c. Actualizar la cuota
    const patchData: Record<string, any> = {
      maintenance_paid: newMaintPaid,
      admin_paid:       newAdminPaid,
      interest_paid:    newIntPaid,
      principal_paid:   newCapPaid,
      status:           newStatus,
    };
    if (newStatus === "paid") {
      patchData.paid_at = new Date().toISOString();
    }

    const { error: updateErr } = await supabase
      .from("leasing_schedule")
      .update(patchData)
      .eq("id", cuota.id);

    if (updateErr) {
      return {
        ok: false, applied: amount - remaining, remaining, distributionsInserted, cuotasTouched,
        error: `Error actualizando cuota #${cuota.installment_no}: ${updateErr.message}`,
      };
    }

    // Si esta cuota quedó 'paid', chequear si el contrato se completó
    if (newStatus === "paid") {
      await maybeCloseContract(contractId);
    }
  }

  return {
    ok: true,
    applied: amount - remaining,
    remaining,
    distributionsInserted,
    cuotasTouched,
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
  let balance = financedCapital;
  let installmentNo = 0;
  let accumulatedInterest = 0;
  const schedule: Array<Record<string, any>> = [];

  let current = new Date(startDate + "T00:00:00Z");
  const MAX_DAYS = 365 * 10; // 10 años max de seguridad
  let dayCount = 0;

  while (balance > 0.5 && dayCount < MAX_DAYS) {
    const iso = current.toISOString().slice(0, 10);
    const isPayDay = validPaymentDates.size === 0 || validPaymentDates.has(iso);

    const dailyInterest = balance * dailyRate;
    accumulatedInterest += dailyInterest;

    if (isPayDay) {
      installmentNo++;
      // La cuota de capital+interés fue definida en la simulación.
      // Si el balance es menor que lo que abonaría a capital, la cuota es menor para cerrar en $0 exacto.
      const interestToPay = accumulatedInterest;
      
      let principalPayment = dailyCapitalInterest - interestToPay;
      if (balance - principalPayment < 0) {
        principalPayment = balance; // Ajuste (reconciliación) para que quede en 0
      }

      schedule.push({
        contract_id:          contractId,
        installment_no:       installmentNo,
        due_date:             iso,
        maintenance_expected: Math.round(dailyMaintenance * 100) / 100,
        admin_expected:       Math.round(dailyAdmin * 100) / 100,
        interest_expected:    Math.round(interestToPay * 100) / 100,
        principal_expected:   Math.round(principalPayment * 100) / 100,
        balance_expected:     Math.round((balance - principalPayment) * 100) / 100,
        status:               "pending",
      });

      balance -= principalPayment;
      accumulatedInterest = 0; // Se pagó todo el interés acumulado
    }

    current.setUTCDate(current.getUTCDate() + 1);
    dayCount++;
  }

  return schedule;
}
