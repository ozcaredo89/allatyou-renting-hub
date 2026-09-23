// src/routes/leasing.ts
// =============================================================================
// Router de Leasing / Rent-to-Own
// Endpoints:
//   POST /leasing/contracts          → Crear contrato + generar cronograma
//   POST /leasing/contracts/generate → Generar documento PDF + DOCX firmable
//   GET  /leasing/contracts          → Listar contratos
//   GET  /leasing/contracts/:id      → Detalle de un contrato
//   GET  /leasing/contracts/:id/schedule → Cronograma de cuotas
//   PATCH /leasing/contracts/:id     → Actualizar estado / PDF URL
// =============================================================================
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import {
  getActiveLeasingContract,
  generateLeasingSchedule,
} from "../lib/leasingCascade";
import {
  generateContract,
  validateRatesVsIBC,
  type ContractData,
} from "../lib/contractGenerator";
import { getAmortizationDates } from "../lib/noPay";

const r = Router();
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

function isISODate(s: any): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ============================================================================
// POST /leasing/contracts
// @deprecated — Flujo legacy v1 (sin Pico y Placa completo). 
// Usar el flujo oficial de dos fases: POST /contracts/generate + PATCH /contracts/:id/activate.
// ============================================================================
r.post("/contracts", async (req: Request, res: Response) => {
  const {
    plate,
    driver_id,
    purchase_price,
    down_payment = 0,
    monthly_rate_pct,
    daily_maintenance = 10000,
    daily_admin = 11000,
    start_date,
    contract_pdf_url,
    notes,
    generate_schedule = true, // si false, solo crea el contrato sin filas
  } = req.body || {};

  // ── Validaciones ──
  if (!plate || !PLATE_RE.test(String(plate).toUpperCase())) {
    return res.status(400).json({ error: "plate debe tener formato ABC123" });
  }
  const upperPlate = String(plate).toUpperCase();

  if (!purchase_price || Number(purchase_price) <= 0) {
    return res.status(400).json({ error: "purchase_price debe ser > 0" });
  }
  if (Number(down_payment) < 0 || Number(down_payment) >= Number(purchase_price)) {
    return res.status(400).json({ error: "down_payment debe ser >= 0 y < purchase_price" });
  }
  if (monthly_rate_pct == null || Number(monthly_rate_pct) < 0) {
    return res.status(400).json({ error: "monthly_rate_pct debe ser >= 0" });
  }
  if (!isISODate(start_date)) {
    return res.status(400).json({ error: "start_date debe ser YYYY-MM-DD" });
  }

  try {
    // ── 1. Verificar que la placa existe ──
    const { data: vehicle, error: vErr } = await supabase
      .from("vehicles")
      .select("plate, status")
      .eq("plate", upperPlate)
      .single();

    if (vErr || !vehicle) {
      return res.status(400).json({ error: "Placa no encontrada en el sistema" });
    }
    if (vehicle.status === "leasing") {
      return res.status(400).json({ error: "Este vehículo ya tiene un contrato de leasing activo" });
    }

    // ── 2. Verificar que no hay ya un contrato leasing activo para la placa ──
    const existing = await getActiveLeasingContract(upperPlate);
    if (existing) {
      return res.status(400).json({ error: "Ya existe un contrato de leasing activo para esta placa" });
    }

    // ── 3. Verificar que el driver_id existe (si se pasó) ──
    if (driver_id) {
      const { data: drv } = await supabase
        .from("drivers")
        .select("id")
        .eq("id", Number(driver_id))
        .maybeSingle();
      if (!drv) {
        return res.status(400).json({ error: "driver_id no encontrado" });
      }
    }

    const capitalFinanciado = Number(purchase_price) - Number(down_payment);

    // ── 4. Insertar contrato ──
    const { data: contract, error: cErr } = await supabase
      .from("leasing_contracts")
      .insert({
        plate: upperPlate,
        driver_id: driver_id ? Number(driver_id) : null,
        purchase_price: Math.round(Number(purchase_price)),
        down_payment: Math.round(Number(down_payment)),
        monthly_rate_pct: Number(monthly_rate_pct),
        daily_maintenance: Math.round(Number(daily_maintenance)),
        daily_admin: Math.round(Number(daily_admin)),
        start_date: String(start_date),
        status: "active",
        contract_pdf_url: contract_pdf_url || null,
        notes: notes || null,
      })
      .select("*")
      .single();

    if (cErr || !contract) {
      const msg = cErr?.message || "insert failed";
      if (msg.includes("uq_leasing_contracts_one_active_per_plate")) {
        return res.status(400).json({ error: "Ya existe un contrato activo para esta placa" });
      }
      return res.status(500).json({ error: msg });
    }

    // ── 5. Cambiar estado del vehículo a 'leasing' ──
    const { error: vUpErr } = await supabase
      .from("vehicles")
      .update({ status: "leasing" })
      .eq("plate", upperPlate);

    if (vUpErr) {
      // Rollback manual del contrato si no pudimos actualizar el vehículo
      await supabase.from("leasing_contracts").delete().eq("id", contract.id);
      return res.status(500).json({ error: `Error actualizando estado del vehículo: ${vUpErr.message}` });
    }

    // ── 6. Generar cronograma (si generate_schedule = true) ──
    let scheduleRowsInserted = 0;
    let schedulePreview: any[] = [];

    if (generate_schedule) {
      // Para P&P usamos un set vacío (cronograma sin restricciones de P&P)
      // El simulador del frontend ya calcula con P&P; aquí generamos el plan base.
      const rows = generateLeasingSchedule(
        contract.id,
        capitalFinanciado,
        Number(monthly_rate_pct),
        Number(daily_maintenance),
        Number(daily_admin),
        Number(req.body.daily_capital_interest || 0),
        String(start_date),
        new Set<string>() // sin filtro P&P para el cronograma contractual
      );

      if (rows.length > 0) {
        // Insertar en lotes de 500 para no exceder límites de Supabase
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const { error: sErr } = await supabase
            .from("leasing_schedule")
            .insert(batch);

          if (sErr) {
            // Si falla la inserción del cronograma, hacemos rollback de todo
            await supabase.from("vehicles").update({ status: vehicle.status }).eq("plate", upperPlate);
            await supabase.from("leasing_contracts").delete().eq("id", contract.id);
            return res.status(500).json({ error: `Error generando cronograma: ${sErr.message}` });
          }
          scheduleRowsInserted += batch.length;
        }
        schedulePreview = rows.slice(0, 30); // primeras 30 para el PDF
      }
    }

    // ── 7. Retornar datos listos para generar el PDF ──
    return res.status(201).json({
      contract,
      schedule_rows_generated: scheduleRowsInserted,
      // Estructura completa para que el generador de PDF la consuma directamente:
      pdf_data: {
        vehicle_plate:       upperPlate,
        driver_id:           driver_id || null,
        purchase_price:      Number(purchase_price),
        down_payment:        Number(down_payment),
        financed_capital:    capitalFinanciado,
        monthly_rate_pct:    Number(monthly_rate_pct),
        daily_maintenance:   Number(daily_maintenance),
        daily_admin:         Number(daily_admin),
        start_date,
        total_installments:  scheduleRowsInserted,
        schedule_preview:    schedulePreview,  // primeras 30 cuotas
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

// ============================================================================
// GET /leasing/contracts
// Lista todos los contratos con filtros opcionales.
// Soporta ?expand=1 para incluir datos de driver y vehicle.
// ============================================================================
r.get("/contracts", async (req: Request, res: Response) => {
  const { plate, driver_id, status, expand, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const selectFields = expand === "1"
    ? "*, driver:drivers(id, full_name, phone, document_number), vehicle:vehicles(plate, brand, line, model_year)"
    : "*";

  let q = supabase
    .from("leasing_contracts")
    .select(selectFields, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(Number(limit))
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (plate) q = q.eq("plate", String(plate).toUpperCase());
  if (driver_id) q = q.eq("driver_id", Number(driver_id));
  if (status) q = q.eq("status", status);

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ items: data ?? [], total: count ?? 0 });
});

// ============================================================================
// GET /leasing/contracts/:id
// Detalle de un contrato. Soporta ?expand=1.
// ============================================================================
r.get("/contracts/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { expand } = req.query as Record<string, string>;

  const selectFields = expand === "1"
    ? "*, driver:drivers(id, full_name, phone, document_number), vehicle:vehicles(plate, brand, line, model_year)"
    : "*";

  const { data, error } = await supabase
    .from("leasing_contracts")
    .select(selectFields)
    .eq("id", Number(id))
    .single();

  if (error) return res.status(error.code === "PGRST116" ? 404 : 500).json({ error: error.message });
  return res.json(data);
});

// ============================================================================
// GET /leasing/contracts/:id/schedule
// Cronograma de cuotas de un contrato, con resumen de estado.
// ============================================================================
r.get("/contracts/:id/schedule", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.query as Record<string, string>;

  let q = supabase
    .from("leasing_schedule")
    .select("*")
    .eq("contract_id", Number(id))
    .order("installment_no", { ascending: true });

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const rows = data ?? [];
  const summary = {
    total_installments: rows.length,
    paid:               rows.filter((r: any) => r.status === "paid").length,
    partially_paid:     rows.filter((r: any) => r.status === "partially_paid").length,
    pending:            rows.filter((r: any) => r.status === "pending").length,
    total_expected:     rows.reduce((s: number, r: any) => s + Number(r.total_expected ?? 0), 0),
    total_collected:    rows.reduce((s: number, r: any) =>
      s + Number(r.maintenance_paid ?? 0) + Number(r.admin_paid ?? 0) +
          Number(r.interest_paid ?? 0)    + Number(r.principal_paid ?? 0), 0),
  };

  return res.json({ summary, items: rows });
});

// ============================================================================
// PATCH /leasing/contracts/:id
// Actualiza campos permitidos: status, contract_pdf_url, notes.
// ============================================================================
r.patch("/contracts/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, contract_pdf_url, notes } = req.body || {};

  const allowed = ["active", "closed", "default"];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: `status debe ser uno de: ${allowed.join(", ")}` });
  }

  const patch: Record<string, any> = {};
  if (status)            patch.status = status;
  if (contract_pdf_url != null) patch.contract_pdf_url = contract_pdf_url;
  if (notes != null)     patch.notes = notes;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Ningún campo modificable enviado" });
  }

  // 1. Obtener contrato actual para validar reglas
  const { data: currentContract, error: getErr } = await supabase
    .from("leasing_contracts")
    .select("status, created_at, signed_contract_url")
    .eq("id", Number(id))
    .single();

  if (getErr || !currentContract) {
    return res.status(404).json({ error: "Contrato no encontrado" });
  }

  // REGLA: Bloqueo de Declarar Incumplimiento si >72h sin contrato firmado
  if (status === "default" && !currentContract.signed_contract_url) {
    const hrs = (new Date().getTime() - new Date(currentContract.created_at).getTime()) / (1000 * 60 * 60);
    if (hrs > 72) {
      return res.status(409).json({ 
        error: "No se puede ejecutar esta acción: el contrato no tiene documento firmado adjunto (>72h)." 
      });
    }
  }

  const { data, error } = await supabase
    .from("leasing_contracts")
    .update(patch)
    .eq("id", Number(id))
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// ============================================================================
// POST /leasing/contracts/:id/execute-pagare
// Ejecutar pagaré (acción legal). Restringido si >72h sin firma.
// ============================================================================
r.post("/contracts/:id/execute-pagare", async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const { data: currentContract, error: getErr } = await supabase
    .from("leasing_contracts")
    .select("status, created_at, signed_contract_url")
    .eq("id", Number(id))
    .single();

  if (getErr || !currentContract) {
    return res.status(404).json({ error: "Contrato no encontrado" });
  }

  // REGLA: Bloqueo de Ejecutar Pagaré si >72h sin contrato firmado
  if (!currentContract.signed_contract_url) {
    const hrs = (new Date().getTime() - new Date(currentContract.created_at).getTime()) / (1000 * 60 * 60);
    if (hrs > 72) {
      return res.status(409).json({ 
        error: "No se puede ejecutar esta acción: el contrato no tiene documento firmado adjunto (>72h)." 
      });
    }
  }

  // Lógica ficticia para ejecutar pagaré (ya que es un placeholder por ahora)
  return res.json({ ok: true, message: "Pagaré ejecutado formalmente (placeholder)." });
});

// ============================================================================
// POST /leasing/contracts/:id/cancel-pending
// Cancela un contrato pendiente y libera el vehículo.
// ============================================================================
r.post("/contracts/:id/cancel-pending", async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: contract, error: cErr } = await supabase
    .from("leasing_contracts")
    .select("status, plate")
    .eq("id", Number(id))
    .single();

  if (cErr || !contract) return res.status(404).json({ error: "Contrato no encontrado" });
  if (contract.status !== "pending") return res.status(400).json({ error: "Solo se pueden cancelar contratos en estado 'pending'" });

  // 1. Marcar como cancelled
  const { error: updErr } = await supabase
    .from("leasing_contracts")
    .update({ status: "cancelled" })
    .eq("id", Number(id));

  if (updErr) return res.status(500).json({ error: updErr.message });

  // 2. Liberar el vehículo
  const { error: vErr } = await supabase
    .from("vehicles")
    .update({ status: "active" }) // Vuelve a active (available)
    .eq("plate", contract.plate);

  if (vErr) console.error("Error liberando vehículo:", vErr.message);

  return res.json({ ok: true, message: "Contrato cancelado y vehículo liberado." });
});

// ============================================================================
// SIMULACIONES — CRUD ligero (solo guarda los inputs, no el cronograma)
// ============================================================================

// POST /leasing/simulations
r.post("/simulations", async (req: Request, res: Response) => {
  const {
    plate,
    purchase_price,
    down_payment = 0,
    monthly_rate_pct,
    daily_quota,
    daily_maintenance = 10000,
    daily_admin = 11000,
    start_date,
    notes,
  } = req.body || {};

  if (!plate || typeof plate !== "string") return res.status(400).json({ error: "plate requerido" });
  if (!purchase_price || Number(purchase_price) <= 0) return res.status(400).json({ error: "purchase_price debe ser > 0" });
  if (monthly_rate_pct == null || Number(monthly_rate_pct) < 0) return res.status(400).json({ error: "monthly_rate_pct inválido" });
  if (!daily_quota || Number(daily_quota) <= 0) return res.status(400).json({ error: "daily_quota debe ser > 0" });
  if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(start_date))) return res.status(400).json({ error: "start_date debe ser YYYY-MM-DD" });

  const { data, error } = await supabase
    .from("leasing_simulations")
    .insert({
      plate: String(plate).toUpperCase(),
      purchase_price: Math.round(Number(purchase_price)),
      down_payment: Math.round(Number(down_payment)),
      monthly_rate_pct: Number(monthly_rate_pct),
      daily_quota: Math.round(Number(daily_quota)),
      daily_maintenance: Math.round(Number(daily_maintenance)),
      daily_admin: Math.round(Number(daily_admin)),
      start_date: String(start_date),
      notes: notes || null,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

// GET /leasing/simulations?plate=ABC123
r.get("/simulations", async (req: Request, res: Response) => {
  const { plate, limit = "50", offset = "0" } = req.query as Record<string, string>;

  let q = supabase
    .from("leasing_simulations")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(Number(limit))
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (plate) q = q.eq("plate", String(plate).toUpperCase());

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ items: data ?? [], total: count ?? 0 });
});

// DELETE /leasing/simulations/:id
r.delete("/simulations/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase
    .from("leasing_simulations")
    .delete()
    .eq("id", Number(id));

  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).send();
});

// GET /leasing/summary?plate=ABC123
// Resumen del contrato activo para el popup en la pantalla de pagos
r.get("/summary", async (req: Request, res: Response) => {
  const { plate } = req.query as Record<string, string>;
  if (!plate) return res.status(400).json({ error: "plate requerido" });

  const upperPlate = String(plate).toUpperCase();

  // 1. Buscar contrato activo
  const { data: contract, error: cErr } = await supabase
    .from("leasing_contracts")
    .select("*")
    .eq("plate", upperPlate)
    .eq("status", "active")
    .maybeSingle();

  if (cErr) return res.status(500).json({ error: cErr.message });
  if (!contract) return res.json({ has_leasing: false });

  // 2. Estadísticas del cronograma
  const { data: rows, error: sErr } = await supabase
    .from("leasing_schedule")
    .select("status, maintenance_expected, maintenance_paid, admin_expected, admin_paid, interest_expected, interest_paid, principal_expected, principal_paid, due_date")
    .eq("contract_id", contract.id)
    .order("due_date", { ascending: false });

  if (sErr) return res.status(500).json({ error: sErr.message });

  const schedule = rows ?? [];
  const totalInstallments = schedule.length;
  const paidInstallments = schedule.filter((r: any) => r.status === "paid").length;
  const pendingInstallments = totalInstallments - paidInstallments;

  const totalExpected = schedule.reduce((s: number, r: any) =>
    s + Number(r.maintenance_expected) + Number(r.admin_expected) + Number(r.interest_expected) + Number(r.principal_expected), 0);

  const totalCollected = schedule.reduce((s: number, r: any) =>
    s + Number(r.maintenance_paid) + Number(r.admin_paid) + Number(r.interest_paid) + Number(r.principal_paid), 0);

  const maintenanceFundAccumulated = schedule.reduce((s: number, r: any) =>
    s + Number(r.maintenance_paid), 0);

  const pendingBalance = totalExpected - totalCollected;

  // Fecha de la última cuota pendiente = fecha estimada de finalización
  const lastPending = [...schedule].reverse().find((r: any) => r.status !== "paid");
  const estimatedEndDate = lastPending?.due_date ?? null;

  // Cuota diaria contractual obtenida del cronograma de leasing
  const firstPending = [...schedule].reverse().find((r: any) => r.status !== "paid") || schedule[0];
  const dailyRate = firstPending
    ? Math.round(
        Number(firstPending.maintenance_expected) +
        Number(firstPending.admin_expected) +
        Number(firstPending.interest_expected) +
        Number(firstPending.principal_expected)
      )
    : null;

  return res.json({
    has_leasing: true,
    contract_id: contract.id,
    plate: upperPlate,
    purchase_price: Number(contract.purchase_price),
    financed_capital: Number(contract.financed_capital),
    start_date: contract.start_date,
    status: contract.status,
    daily_rate: dailyRate,
    total_installments: totalInstallments,
    paid_installments: paidInstallments,
    pending_installments: pendingInstallments,
    total_collected: Math.round(totalCollected),
    pending_balance: Math.round(pendingBalance),
    maintenance_fund_accumulated: Math.round(maintenanceFundAccumulated),
    estimated_end_date: estimatedEndDate,
  });
});

// ============================================================================
// POST /leasing/contracts/generate
// Genera el documento de contrato (PDF + DOCX) para un contrato ya activo.
// Requiere que el contrato exista y esté activo.
// Devuelve presigned URLs S3 con TTL de 30 minutos.
// ============================================================================
r.post("/contracts/generate", async (req: Request, res: Response) => {
  const {
    // Datos de la simulación
    plate,
    driver_id,
    purchase_price,
    down_payment = 0,
    monthly_rate_pct,
    daily_maintenance = 10000,
    daily_admin = 11000,
    start_date,

    // Datos adicionales del conductor y vehículo para el documento
    taller_autorizado,
    geocerca_descripcion,
    limite_velocidad_kmh,
    valor_garantia,
    valor_clausula_penal,
    mora_pct,
    daily_capital_interest, // cuota fija capital+interés del simulador
    medio_pago,
    vehiculo_cilindraje,
    vehiculo_combustible,
    vehiculo_color,
    vehiculo_carroceria,
  } = req.body || {};

  if (!plate || !PLATE_RE.test(String(plate).toUpperCase())) {
    return res.status(400).json({ error: "plate debe tener formato ABC123" });
  }
  const upperPlate = String(plate).toUpperCase();

  if (!daily_capital_interest || Number(daily_capital_interest) <= 0) {
    return res.status(400).json({ error: "daily_capital_interest (cuota fija capital+interés) es requerido" });
  }
  if (mora_pct == null || Number(mora_pct) < 0) {
    return res.status(400).json({ error: "mora_pct (tasa de mora mensual %) es requerida" });
  }

  try {
    // ── 1. Verificar tasas vs IBC antes de cualquier inserción ──
    const rateCheck = await validateRatesVsIBC(
      Number(monthly_rate_pct),
      Number(mora_pct)
    );
    if (!rateCheck.ok) {
      return res.status(400).json({ error: rateCheck.error });
    }

    // ── 2. Cargar datos del conductor (comprador) ──
    if (!driver_id) {
      return res.status(400).json({ error: "Se requiere un driver_id asignado para generar el contrato" });
    }
    const { data: driver, error: dErr } = await supabase
      .from("drivers")
      .select("id, full_name, document_number, address, email, phone")
      .eq("id", Number(driver_id))
      .single();

    if (dErr || !driver) {
      console.error("Driver fetch error:", dErr, "driver_id received:", driver_id, "casted:", Number(driver_id));
      return res.status(400).json({ error: "Conductor/comprador no encontrado" });
    }

    // ── 3. Cargar datos del vehículo ──
    const { data: vehicle, error: vErr } = await supabase
      .from("vehicles")
      .select("plate, brand, line, model_year, status")
      .eq("plate", upperPlate)
      .single();

    if (vErr || !vehicle) {
      return res.status(400).json({ error: "Vehículo no encontrado" });
    }
    if (vehicle.status === "leasing") {
      return res.status(400).json({ error: "Este vehículo ya tiene un contrato de leasing activo" });
    }

    // ── 3.1. Obtener fechas válidas de Pico y Placa ──
    let validPaymentDatesArray: string[] = [];
    try {
      const datesRes = await getAmortizationDates(upperPlate, String(start_date), 1500, "Cali");
      validPaymentDatesArray = datesRes.dates;
    } catch (e: any) {
      console.error("Error cargando Pico y Placa:", e?.message);
      return res.status(422).json({ error: "No se pudo verificar restricciones de pico y placa, intente de nuevo" });
    }

    // ── 4. Marcar contratos pendientes anteriores como superseded ──
    await supabase
      .from("leasing_contracts")
      .update({ status: "superseded" })
      .eq("plate", upperPlate)
      .eq("status", "pending");

    // ── 5. Crear el nuevo contrato en estado 'pending' ──
    const { data: contract, error: cErr } = await supabase
      .from("leasing_contracts")
      .insert({
        plate: upperPlate,
        driver_id: Number(driver_id),
        purchase_price: Math.round(Number(purchase_price)),
        down_payment: Math.round(Number(down_payment)),
        monthly_rate_pct: Number(monthly_rate_pct),
        daily_maintenance: Math.round(Number(daily_maintenance)),
        daily_admin: Math.round(Number(daily_admin)),
        daily_capital_interest: Math.round(Number(req.body.daily_capital_interest || 0)),
        start_date: String(start_date),
        status: "pending",
        valid_payment_dates: validPaymentDatesArray,
      })
      .select("*")
      .single();

    if (cErr || !contract) {
      return res.status(500).json({ error: `Error creando contrato pendiente: ${cErr?.message}` });
    }

    // ── 6. Cambiar vehículo a 'reserved' si estaba activo/mantenimiento ──
    if (vehicle.status !== "reserved") {
      await supabase
        .from("vehicles")
        .update({ status: "reserved" })
        .eq("plate", upperPlate);
    }

    // ── 7. Construir objeto ContractData ──
    const contractData: ContractData = {
      contract_id: contract.id,
      driver_id: contract.driver_id,

      comprador_nombre:   driver.full_name || "",
      comprador_cedula:   driver.document_number || "",
      comprador_ciudad:   driver.address || (geocerca_descripcion ? "Colombia" : "Cali"),
      comprador_email:    driver.email || "",
      comprador_telefono: driver.phone || "",

      vehiculo_placa:      vehicle.plate,
      vehiculo_marca:      vehicle.brand || "",
      vehiculo_linea:      vehicle.line || "",
      vehiculo_modelo:     String(vehicle.model_year || ""),
      vehiculo_cilindraje: vehiculo_cilindraje || "—",
      vehiculo_combustible: vehiculo_combustible || "GASOLINA",
      vehiculo_color:       vehiculo_color || "—",
      vehiculo_carroceria:  vehiculo_carroceria || "—",

      purchase_price:    Number(contract.purchase_price),
      down_payment:      Number(contract.down_payment),
      financed_capital:  Number(contract.financed_capital),
      monthly_rate_pct:  Number(contract.monthly_rate_pct),
      daily_maintenance: Number(contract.daily_maintenance),
      daily_admin:       Number(contract.daily_admin),
      start_date:        contract.start_date,

      taller_autorizado:    taller_autorizado || "Por definir",
      geocerca_descripcion: geocerca_descripcion || "área metropolitana autorizada",
      limite_velocidad_kmh: String(limite_velocidad_kmh || 100),

      valor_garantia:      Number(valor_garantia || 0),
      valor_clausula_penal: Number(valor_clausula_penal || 0),

      medio_pago,
      generated_by: "admin",
    };

    // ── 8. Construir Set de fechas válidas (ya calculadas y guardadas) ──
    const validPaymentDates = new Set<string>(contract.valid_payment_dates || []);

    // ── 9. Generar el contrato ──
    const result = await generateContract(
      contractData,
      Number(daily_capital_interest),
      Number(mora_pct),
      validPaymentDates
    );

    return res.status(201).json({
      ok: true,
      contract_id: contract.id,
      numero_contrato: result.numero_contrato,
      numero_pagare:   result.numero_pagare,
      pdf_url:         result.pdf_url,
      docx_url:        result.docx_url,
      template_version: result.template_version.slice(0, 8),
      version_id:      result.version_id,
      note: "Las URLs expiran en 30 minutos. Descarga los documentos antes de que expiren.",
    });

  } catch (err: any) {
    console.error("❌ Error generando contrato:", err?.message);
    return res.status(500).json({ error: err?.message || "Error generando el contrato" });
  }
});

// ============================================================================
// PATCH /leasing/contracts/:id/activate
// Activa un contrato pendiente de manera atómica (RPC en Postgres),
// exigiendo el documento autenticado en Cloudflare R2 y confirmación de start_date.
// ============================================================================
r.patch("/contracts/:id/activate", async (req: Request, res: Response) => {
  const contractId = Number(req.params.id);
  const { signed_contract_url, start_date, start_date_confirmed } = req.body || {};

  try {
    // 1. Validación estricta de URL en Cloudflare R2
    if (!signed_contract_url || typeof signed_contract_url !== "string" || !signed_contract_url.trim()) {
      return res.status(400).json({ error: "El contrato firmado/autenticado es obligatorio para activar el leasing" });
    }
    const r2Base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
    if (!r2Base || !signed_contract_url.startsWith(r2Base + "/")) {
      return res.status(400).json({ error: "La URL del contrato firmado debe provenir del almacenamiento oficial R2" });
    }

    // 2. Validación de confirmación explícita de start_date
    if (start_date_confirmed !== true) {
      return res.status(400).json({ error: "Debe confirmar explícitamente que la fecha de inicio coincide con la del contrato firmado y autenticado" });
    }

    // 3. Obtener contrato para verificar y tomar valores
    const { data: contract, error: cErr } = await supabase
      .from("leasing_contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (cErr || !contract) {
      return res.status(404).json({ error: "Contrato no encontrado" });
    }
    if (contract.status !== "pending") {
      return res.status(409).json({ error: `Solo se pueden activar contratos en estado 'pending'. Estado actual: '${contract.status}'` });
    }

    // 4. Determinar fecha efectiva y validar formato ISO
    const effectiveStartDate = (start_date && typeof start_date === "string") ? start_date : contract.start_date;
    if (!isISODate(effectiveStartDate)) {
      return res.status(400).json({ error: "start_date debe tener formato YYYY-MM-DD" });
    }

    // 5. Garantía y recálculo de Pico y Placa
    let validPaymentDatesArray: string[] = contract.valid_payment_dates || [];
    const dateChanged = effectiveStartDate !== contract.start_date;
    const datesMissing = !Array.isArray(validPaymentDatesArray) || validPaymentDatesArray.length === 0;

    if (dateChanged || datesMissing) {
      try {
        const datesRes = await getAmortizationDates(contract.plate, String(effectiveStartDate), 1500, "Cali");
        validPaymentDatesArray = datesRes.dates;
      } catch (e: any) {
        console.error("Error recalculando Pico y Placa:", e?.message);
        return res.status(422).json({ error: "No se pudieron calcular las restricciones de pico y placa para la fecha de inicio indicada" });
      }
    }

    if (!Array.isArray(validPaymentDatesArray) || validPaymentDatesArray.length === 0) {
      return res.status(422).json({ error: "El calendario de días de pago no puede estar vacío" });
    }

    // 6. Generar cronograma de pagos en memoria
    const capitalFinanciado = Number(contract.financed_capital);
    const validPaymentDates = new Set<string>(validPaymentDatesArray);

    const scheduleRows = generateLeasingSchedule(
      contract.id,
      capitalFinanciado,
      Number(contract.monthly_rate_pct),
      Number(contract.daily_maintenance),
      Number(contract.daily_admin),
      Number(contract.daily_capital_interest),
      String(effectiveStartDate),
      validPaymentDates
    );

    if (!scheduleRows || scheduleRows.length === 0) {
      return res.status(422).json({ error: "No se pudieron generar las cuotas del cronograma" });
    }

    // 7. Llamar a la RPC transaccional en Postgres
    const { data: rpcData, error: rpcErr } = await supabase.rpc("activate_leasing_contract", {
      p_contract_id: contract.id,
      p_start_date: effectiveStartDate,
      p_valid_dates: validPaymentDatesArray,
      p_schedule: scheduleRows,
      p_signed_url: signed_contract_url,
    });

    if (rpcErr) {
      const msg = rpcErr.message || "";
      const code = rpcErr.code || "";
      console.error("RPC activate_leasing_contract error:", rpcErr);

      if (code === "23P01" || msg.includes("ALREADY_ACTIVE") || msg.includes("NOT_PENDING")) {
        return res.status(409).json({ error: msg });
      }
      if (msg.includes("CONTRACT_NOT_FOUND")) {
        return res.status(404).json({ error: msg });
      }
      if (msg.includes("EMPTY_SCHEDULE") || msg.includes("EMPTY_VALID_DATES")) {
        return res.status(422).json({ error: msg });
      }
      return res.status(500).json({ error: `Error activando contrato: ${msg}` });
    }

    return res.json({
      ok: true,
      message: "Contrato activado exitosamente",
      contract_id: contract.id,
      schedule_rows: rpcData?.schedule_count ?? scheduleRows.length,
    });

  } catch (err: any) {
    console.error("❌ Error inesperado activando contrato:", err?.message);
    return res.status(500).json({ error: err?.message || "Error interno activando contrato" });
  }
});

export default r;
