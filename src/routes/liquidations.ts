import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { generatePazSalvo } from "../lib/pazSalvoGenerator";
import { getSignedDocUrl } from "../lib/documentRenderer";
import { addCalendarDays, LIQUIDATION_SIMIT_DAYS } from "../lib/fleetReminders";

const r = Router();

function toYmd(value: unknown): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ""));
  if (m && m[1]) return m[1];
  return new Date().toISOString().slice(0, 10);
}

function enrichLiquidationRecord(liq: any) {
  if (!liq) return null;
  const meta = liq.document_metadata || {};
  const auditLog = Array.isArray(liq.audit_log) ? liq.audit_log : [];
  const hasPazSalvoAudit = auditLog.some((a: any) => a?.action === "GENERATE_PAZ_SALVO");

  const retireYmd = toYmd(liq.liquidation_date || liq.created_at);
  const paymentDueDate =
    (liq.payment_due_date ? toYmd(liq.payment_due_date) : null) ||
    (meta.payment_due_date ? toYmd(meta.payment_due_date) : null) ||
    addCalendarDays(retireYmd, LIQUIDATION_SIMIT_DAYS);

  const paymentProofUrl = liq.payment_proof_url || meta.payment_proof_url || null;
  const paidAt = liq.paid_at || meta.paid_at || null;
  const paymentNotes = liq.payment_notes ?? meta.payment_notes ?? null;
  const hasPazSalvo = Boolean(liq.pdf_s3_key || meta.pdf_s3_key || hasPazSalvoAudit);

  return {
    ...liq,
    retire_date: retireYmd,
    payment_due_date: paymentDueDate,
    payment_proof_url: paymentProofUrl,
    paid_at: paidAt,
    payment_notes: paymentNotes,
    has_paz_salvo: hasPazSalvo,
  };
}

// 0. GET /liquidations/calendar — Listado completo de retiros y liquidaciones para el Calendario
r.get("/calendar", async (_req: Request, res: Response) => {
  try {
    const [{ data: liqs, error: liqErr }, { data: drivers, error: drvErr }] = await Promise.all([
      supabase.from("liquidations").select("*").order("liquidation_date", { ascending: false }),
      supabase
        .from("drivers")
        .select("id, full_name, document_number, phone, email, status, terminated_at, created_at"),
    ]);

    if (liqErr) throw liqErr;
    if (drvErr) throw drvErr;

    const driverMap = new Map<number, any>();
    for (const d of drivers || []) {
      driverMap.set(Number(d.id), d);
    }

    const liquidatedDriverIds = new Set<number>();
    const items: any[] = [];

    for (const rawLiq of liqs || []) {
      const liq = enrichLiquidationRecord(rawLiq);
      const drv = driverMap.get(Number(rawLiq.driver_id));
      liquidatedDriverIds.add(Number(rawLiq.driver_id));

      items.push({
        id: String(liq.id),
        liquidation_id: String(liq.id),
        driver_id: Number(liq.driver_id),
        driver_name: drv?.full_name || `Conductor #${liq.driver_id}`,
        document_number: drv?.document_number || "—",
        phone: drv?.phone || "—",
        plate: liq.plate || null,
        retire_date: liq.retire_date,
        payment_due_date: liq.payment_due_date,
        total_incomes: Number(liq.total_incomes || 0),
        total_deductions: Number(liq.total_deductions || 0),
        final_balance: Number(liq.final_balance || 0),
        has_paz_salvo: liq.has_paz_salvo,
        payment_proof_url: liq.payment_proof_url,
        paid_at: liq.paid_at,
        payment_notes: liq.payment_notes,
        is_paid: Boolean(liq.payment_proof_url || liq.paid_at),
        has_liquidation: true,
      });
    }

    // Incluir conductores retirados (terminated_at != null) que aún no tengan registro en `liquidations`
    for (const drv of drivers || []) {
      if (drv.terminated_at && !liquidatedDriverIds.has(Number(drv.id))) {
        const retireDate = toYmd(drv.terminated_at);
        items.push({
          id: `drv-${drv.id}`,
          liquidation_id: null,
          driver_id: Number(drv.id),
          driver_name: drv.full_name,
          document_number: drv.document_number || "—",
          phone: drv.phone || "—",
          plate: null,
          retire_date: retireDate,
          payment_due_date: addCalendarDays(retireDate, LIQUIDATION_SIMIT_DAYS),
          total_incomes: 0,
          total_deductions: 0,
          final_balance: 0,
          has_paz_salvo: false,
          payment_proof_url: null,
          paid_at: null,
          payment_notes: null,
          is_paid: false,
          has_liquidation: false,
        });
      }
    }

    items.sort((a, b) => b.retire_date.localeCompare(a.retire_date));
    return res.json({ items, simit_days: LIQUIDATION_SIMIT_DAYS });
  } catch (err: any) {
    console.error("Error in GET /liquidations/calendar:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 1. GET data required for the liquidation modal
r.get("/:driverId/data", async (req: Request, res: Response) => {
  const { driverId } = req.params;

  try {
    // A. Driver basic info (enriquecido con cédula, teléfono, email, fechas)
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, full_name, document_number, phone, email, address, deposit_amount, created_at, status, terminated_at")
      .eq("id", driverId)
      .single();

    if (!driver) return res.status(404).json({ error: "Conductor no encontrado" });

    // B. Get assigned plate
    // 1st check vehicle_assignments (last active)
    let plate = null;
    const { data: assignments } = await supabase
      .from("vehicle_assignments")
      .select("plate")
      .eq("driver_id", driverId)
      .is("end_date", null)
      .order("start_date", { ascending: false })
      .limit(1);

    if (assignments && assignments.length > 0) {
      plate = assignments[0]?.plate;
    } else {
      // fallback to vehicles table directly
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("plate")
        .eq("current_driver_id", driverId)
        .limit(1);
      if (vehicles && vehicles.length > 0) {
        plate = vehicles[0]?.plate;
      }
    }

    // F. Check if already liquidated (antes de buscar vehículo por si la placa viene en la liquidación)
    const { data: existingLiquidationRows } = await supabase
      .from("liquidations")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(1);

    const existingLiquidation =
      existingLiquidationRows && existingLiquidationRows.length > 0
        ? enrichLiquidationRecord(existingLiquidationRows[0])
        : null;

    if (!plate && existingLiquidation?.plate) {
      plate = existingLiquidation.plate;
    }

    // Datos base del vehículo si existe placa asignada
    let vehicle = null;
    if (plate) {
      const { data: vData } = await supabase
        .from("vehicles")
        .select("plate, brand, line, model_year, status")
        .eq("plate", plate)
        .maybeSingle();
      vehicle = vData;
    }

    // C. Rango de fechas de ahorro puras desde payments (cuota diaria)
    let savingsStartDate: string | null = null;
    let savingsEndDate: string | null = null;

    const { data: firstPayment } = await supabase
      .from("payments")
      .select("payment_date")
      .eq("driver_id", driverId)
      .gt("insurance_amount", 0)
      .order("payment_date", { ascending: true })
      .limit(1);

    if (firstPayment && firstPayment.length > 0 && firstPayment[0]) {
      savingsStartDate = firstPayment[0].payment_date;
    }

    const { data: lastPayment } = await supabase
      .from("payments")
      .select("payment_date")
      .eq("driver_id", driverId)
      .gt("insurance_amount", 0)
      .order("payment_date", { ascending: false })
      .limit(1);

    if (lastPayment && lastPayment.length > 0 && lastPayment[0]) {
      savingsEndDate = lastPayment[0].payment_date;
    }

    // D. Get Total Ahorro (using driver_balances_view)
    const { data: balanceData } = await supabase
      .from("driver_balances_view")
      .select("total_balance")
      .eq("id", driverId)
      .single();

    const totalBalance = balanceData ? Number(balanceData.total_balance) : 0;
    const initialDeposit = Number(driver.deposit_amount || 0);
    const ahorro = totalBalance - initialDeposit;

    // D. Get Pending Advances/Loans
    // Need to find advances for this driver
    const { data: advances } = await supabase
      .from("operational_advances")
      .select("id")
      .eq("driver_id", driverId);

    let pendingInstallments = 0;
    let pendingDetails: any[] = [];
    if (advances && advances.length > 0) {
      const advIds = advances.map(a => a.id);
      const { data: schedules } = await supabase
        .from("operational_advance_schedule")
        .select("id, advance_id, amount, expected_date, status")
        .in("advance_id", advIds)
        .eq("status", "pending");
      
      if (schedules) {
        pendingDetails = schedules;
        pendingInstallments = schedules.reduce((sum, s) => sum + Number(s.amount), 0);
      }
    }

    // D2. Días en mora que se descuentan en la liquidación (pagos.md §6, "descuento en liquidación"):
    // marcadores con receipt_status = 'liquidation_debt' aún sin liquidar (liquidation_id NULL).
    // Si el conductor ya tiene una liquidación cerrada, la deuda queda aparte y se sigue mostrando aquí.
    const { data: debtRows } = await supabase
      .from("payments")
      .select("id, plate, payment_date, liquidation_debt_amount, notes")
      .eq("driver_id", driverId)
      .eq("receipt_status", "liquidation_debt")
      .eq("status", "confirmed")
      .is("liquidation_id", null)
      .order("payment_date", { ascending: true });
    const pendingRentDebtDetails = (debtRows ?? []).map((p: any) => ({
      id: p.id,
      plate: p.plate,
      payment_date: p.payment_date,
      amount: Number(p.liquidation_debt_amount || 0),
      notes: p.notes ?? null,
    }));
    const pendingRentDebt = pendingRentDebtDetails.reduce((s, p) => s + p.amount, 0);

    // E. Get recent repairs if plate exists
    let repairs: any[] = [];
    if (plate) {
      const { data: expenses } = await supabase
        .from("expenses")
        .select("id, date, item, total_amount, category, expense_vehicles!inner(plate)")
        .in("category", ["Mantenimiento", "Reparación"])
        .eq("expense_vehicles.plate", plate)
        .order("date", { ascending: false });

      if (expenses) {
        repairs = expenses.map(e => ({
          id: e.id,
          date: e.date,
          item: e.item,
          total_amount: Number(e.total_amount),
          category: e.category
        }));
      }
    }

    return res.json({
      driver,
      plate,
      vehicle,
      savingsStartDate,
      savingsEndDate,
      ahorro,
      initialDeposit,
      pendingInstallments,
      pendingDetails,
      pendingRentDebt,
      pendingRentDebtDetails,
      repairs,
      existingLiquidation
    });

  } catch (err: any) {
    console.error("Error in GET /liquidations/data:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 2. POST create liquidation
r.post("/", async (req: Request, res: Response) => {
  const { 
    driver_id, plate, total_incomes, total_deductions, final_balance, items_detail, 
    created_by, mark_installments_paid, liquidation_debt_ids, liquidation_date, payment_due_date
  } = req.body;

  try {
    const liqDateIso = liquidation_date ? new Date(liquidation_date).toISOString() : new Date().toISOString();
    const retireYmd = toYmd(liqDateIso);
    const dueYmd = payment_due_date ? toYmd(payment_due_date) : addCalendarDays(retireYmd, LIQUIDATION_SIMIT_DAYS);

    // 1. Insert Liquidation (con respaldo en document_metadata por si la migración aún no corre)
    let liquidation: any = null;
    const { data: liqWithCols, error: liqErr } = await supabase
      .from("liquidations")
      .insert({
        driver_id,
        plate,
        liquidation_date: liqDateIso,
        payment_due_date: dueYmd,
        total_incomes,
        total_deductions,
        final_balance,
        items_detail,
        created_by,
        document_metadata: { payment_due_date: dueYmd },
        audit_log: []
      })
      .select()
      .single();

    if (liqErr) {
      // Fallback si la columna payment_due_date aún no existe en remoto
      const { data: liqFallback, error: fallbackErr } = await supabase
        .from("liquidations")
        .insert({
          driver_id,
          plate,
          liquidation_date: liqDateIso,
          total_incomes,
          total_deductions,
          final_balance,
          items_detail,
          created_by,
          document_metadata: { payment_due_date: dueYmd },
          audit_log: []
        })
        .select()
        .single();
      if (fallbackErr) throw fallbackErr;
      liquidation = liqFallback;
    } else {
      liquidation = liqWithCols;
    }

    // 2. Adjust Deposits (Negative balance to leave overall at $0)
    if (Number(total_incomes) > 0) {
      await supabase.from("driver_deposit_movements").insert({
        driver_id,
        amount: -Number(total_incomes),
        type: "MANUAL_ADJUSTMENT",
        concept: "LIQUIDACIÓN",
        notes: `Cierre por liquidación ${liquidation.id}`,
        created_by
      });
    }

    // 3. Update driver status to inactive and set terminated_at
    await supabase
      .from("drivers")
      .update({ 
        status: "inactive", 
        terminated_at: liqDateIso,
        updated_at: new Date().toISOString()
      })
      .eq("id", driver_id);

    // 4. End vehicle assignment
    if (plate) {
      await supabase
        .from("vehicle_assignments")
        .update({ end_date: liqDateIso, updated_at: new Date().toISOString() })
        .eq("driver_id", driver_id)
        .eq("plate", plate)
        .is("end_date", null);

      await supabase
        .from("vehicles")
        .update({ current_driver_id: null, owner_name: "SIN CONDUCTOR ASIGNADO", updated_at: new Date().toISOString() })
        .eq("plate", plate);
    }

    // 4b. Días en mora descontados en esta liquidación: quedan saldados (liquidation_id)
    const debtIds = Array.isArray(liquidation_debt_ids) ? liquidation_debt_ids.map(Number).filter((n: number) => n > 0) : [];
    if (debtIds.length) {
      await supabase
        .from("payments")
        .update({ liquidation_id: liquidation.id, updated_at: new Date().toISOString() })
        .in("id", debtIds)
        .eq("driver_id", driver_id)
        .eq("receipt_status", "liquidation_debt")
        .is("liquidation_id", null);
    }

    // 5. Handle pending installments if requested
    if (mark_installments_paid) {
      const { data: advances } = await supabase
        .from("operational_advances")
        .select("id")
        .eq("driver_id", driver_id);

      if (advances && advances.length > 0) {
        const advIds = advances.map((a: any) => a.id);
        
        await supabase
          .from("operational_advance_schedule")
          .update({ status: "paid" })
          .in("advance_id", advIds)
          .eq("status", "pending");
      }
    }

    return res.json(enrichLiquidationRecord(liquidation));

  } catch (err: any) {
    console.error("Error in POST /liquidations:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 3. PUT edit liquidation
r.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { total_incomes, total_deductions, final_balance, items_detail, edited_by, payment_due_date } = req.body;

  try {
    const { data: oldLiq } = await supabase
      .from("liquidations")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldLiq) return res.status(404).json({ error: "Not found" });

    const auditEntry = {
      edited_at: new Date().toISOString(),
      edited_by,
      previous_values: {
        total_incomes: oldLiq.total_incomes,
        total_deductions: oldLiq.total_deductions,
        final_balance: oldLiq.final_balance,
        items_detail: oldLiq.items_detail
      }
    };

    const newAuditLog = [...(oldLiq.audit_log || []), auditEntry];
    const nextMeta = {
      ...(oldLiq.document_metadata || {}),
      ...(payment_due_date ? { payment_due_date: toYmd(payment_due_date) } : {}),
    };

    const updatePayload: any = {
      total_incomes,
      total_deductions,
      final_balance,
      items_detail,
      edited_by,
      document_metadata: nextMeta,
      audit_log: newAuditLog,
      updated_at: new Date().toISOString()
    };
    if (payment_due_date) {
      updatePayload.payment_due_date = toYmd(payment_due_date);
    }

    let newLiq: any = null;
    const { data: updatedWithCols, error } = await supabase
      .from("liquidations")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      delete updatePayload.payment_due_date;
      const { data: updatedFallback, error: fallbackErr } = await supabase
        .from("liquidations")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();
      if (fallbackErr) throw fallbackErr;
      newLiq = updatedFallback;
    } else {
      newLiq = updatedWithCols;
    }

    // Adjust deposits difference
    const incomeDiff = Number(oldLiq.total_incomes) - Number(total_incomes);
    if (incomeDiff !== 0) {
       await supabase.from("driver_deposit_movements").insert({
        driver_id: oldLiq.driver_id,
        amount: incomeDiff,
        type: "MANUAL_ADJUSTMENT",
        concept: "AJUSTE LIQUIDACIÓN",
        notes: `Ajuste por edición de liquidación ${id}`,
        created_by: edited_by
      });
    }

    return res.json(enrichLiquidationRecord(newLiq));

  } catch (err: any) {
    console.error("Error in PUT /liquidations:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 4. POST generate Paz y Salvo document (PDF + DOCX)
r.post("/:id/generate-document", async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body || {};

  try {
    const result = await generatePazSalvo({
      liquidationId: id,
      ...body,
    });
    return res.json(result);
  } catch (err: any) {
    console.error("Error generating Paz y Salvo:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 5. GET fresh presigned URLs for existing documents
r.get("/:id/document-urls", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { data: liq, error } = await supabase
      .from("liquidations")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !liq) return res.status(404).json({ error: "Liquidación no encontrada" });

    // Determinar claves fijas
    const pdfKey = liq.pdf_s3_key || `liquidations/paz_salvo_${id}.pdf`;
    const docxKey = liq.docx_s3_key || `liquidations/paz_salvo_${id}.docx`;

    const [pdf_url, docx_url] = await Promise.all([
      getSignedDocUrl(pdfKey),
      getSignedDocUrl(docxKey),
    ]);

    return res.json({
      pdf_url,
      docx_url,
      pdf_s3_key: pdfKey,
      docx_s3_key: docxKey,
    });
  } catch (err: any) {
    console.error("Error getting document URLs:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 6. POST register/update Comprobante de Pago of liquidation
r.post("/:id/payment-proof", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { payment_proof_url, paid_at, payment_notes, recorded_by } = req.body || {};

  if (!payment_proof_url) {
    return res.status(400).json({ error: "Se requiere la URL del comprobante de pago (payment_proof_url)" });
  }

  try {
    const { data: oldLiq, error: findErr } = await supabase
      .from("liquidations")
      .select("*")
      .eq("id", id)
      .single();

    if (findErr || !oldLiq) {
      return res.status(404).json({ error: "Liquidación no encontrada" });
    }

    const paidAtIso = paid_at ? new Date(paid_at).toISOString() : new Date().toISOString();
    const auditEntry = {
      action: "REGISTER_PAYMENT_PROOF",
      timestamp: new Date().toISOString(),
      recorded_by: recorded_by || "Admin",
      payment_proof_url,
      paid_at: paidAtIso,
      payment_notes: payment_notes || null,
    };

    const newAuditLog = [...(oldLiq.audit_log || []), auditEntry];
    const nextMeta = {
      ...(oldLiq.document_metadata || {}),
      payment_proof_url,
      paid_at: paidAtIso,
      payment_notes: payment_notes || null,
    };

    let updated: any = null;
    const { data: upCols, error: upErr } = await supabase
      .from("liquidations")
      .update({
        payment_proof_url,
        paid_at: paidAtIso,
        payment_notes: payment_notes || null,
        document_metadata: nextMeta,
        audit_log: newAuditLog,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (upErr) {
      // Fallback en caso de que las columnas dedicadas aún no estén aplicadas en DB
      const { data: upFallback, error: fbErr } = await supabase
        .from("liquidations")
        .update({
          document_metadata: nextMeta,
          audit_log: newAuditLog,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (fbErr) throw fbErr;
      updated = upFallback;
    } else {
      updated = upCols;
    }

    return res.json(enrichLiquidationRecord(updated));
  } catch (err: any) {
    console.error("Error in POST /liquidations/:id/payment-proof:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default r;
