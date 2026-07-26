import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// 1. GET data required for the liquidation modal
r.get("/:driverId/data", async (req: Request, res: Response) => {
  const { driverId } = req.params;

  try {
    // A. Driver basic info
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, full_name, deposit_amount, created_at, status")
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

    // C. Get Total Ahorro (using driver_balances_view)
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

    // F. Check if already liquidated
    const { data: existingLiquidation } = await supabase
      .from("liquidations")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(1);

    return res.json({
      driver,
      plate,
      ahorro,
      initialDeposit,
      pendingInstallments,
      pendingDetails,
      repairs,
      existingLiquidation: existingLiquidation && existingLiquidation.length > 0 ? existingLiquidation[0] : null
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
    created_by, mark_installments_paid 
  } = req.body;

  try {
    // We could re-validate balances here, but since the user allows manual edits,
    // we'll proceed with the requested items but we'll register the adjustments.

    // 1. Insert Liquidation
    const { data: liquidation, error: liqErr } = await supabase
      .from("liquidations")
      .insert({
        driver_id,
        plate,
        total_incomes,
        total_deductions,
        final_balance,
        items_detail,
        created_by,
        audit_log: []
      })
      .select()
      .single();

    if (liqErr) throw liqErr;

    // 2. Adjust Deposits (Negative balance to leave overall at $0)
    // If the system owes the driver (positive final_balance), or the driver owes (negative final_balance)
    // We create a single movement that represents the "LIQUIDATION SETTLEMENT".
    // Wait, the total_incomes (Ahorro + Deposito) were extracted. We need to withdraw them from the deposits system.
    // So we add a movement of -total_incomes to clear their savings.
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
        terminated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", driver_id);

    // 4. End vehicle assignment
    if (plate) {
      // update vehicle_assignments
      await supabase
        .from("vehicle_assignments")
        .update({ end_date: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("driver_id", driver_id)
        .eq("plate", plate)
        .is("end_date", null);

      // update vehicle
      await supabase
        .from("vehicles")
        .update({ current_driver_id: null, owner_name: "SIN CONDUCTOR ASIGNADO", updated_at: new Date().toISOString() })
        .eq("plate", plate);
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

    return res.json(liquidation);

  } catch (err: any) {
    console.error("Error in POST /liquidations:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 3. PUT edit liquidation
r.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { total_incomes, total_deductions, final_balance, items_detail, edited_by } = req.body;

  try {
    // Fetch old to build audit log
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

    const { data: newLiq, error } = await supabase
      .from("liquidations")
      .update({
        total_incomes,
        total_deductions,
        final_balance,
        items_detail,
        edited_by,
        audit_log: newAuditLog,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Adjust deposits difference
    const incomeDiff = Number(oldLiq.total_incomes) - Number(total_incomes);
    if (incomeDiff !== 0) {
       await supabase.from("driver_deposit_movements").insert({
        driver_id: oldLiq.driver_id,
        amount: incomeDiff, // if income decreased, difference is positive, so we return to balance. If income increased, diff is negative, so we subtract more.
        type: "MANUAL_ADJUSTMENT",
        concept: "AJUSTE LIQUIDACIÓN",
        notes: `Ajuste por edición de liquidación ${id}`,
        created_by: edited_by
      });
    }

    return res.json(newLiq);

  } catch (err: any) {
    console.error("Error in PUT /liquidations:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default r;
