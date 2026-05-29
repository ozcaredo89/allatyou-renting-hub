import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// 1. RESUMEN: Listado de conductores con su saldo total calculado
r.get("/", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("driver_balances_view")
      .select("*")
      .order("full_name");

    if (error) throw new Error(error.message);

    const report = data.map((d: any) => ({
      id: d.id,
      full_name: d.full_name,
      vehicle_plate: d.vehicle_plate || "Sin Asignar",
      is_active: d.status === "active",
      total_balance: Number(d.total_balance) || 0,
    }));

    return res.json(report);
  } catch (err: any) {
    // Tip: Si falla aquí, revisa la consola del servidor para ver el mensaje exacto
    console.error("Error en GET /deposits:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 2. DETALLE: Historial unificado para un conductor
r.get("/:driverId/details", async (req: Request, res: Response) => {
  const { driverId } = req.params;

  try {
    const { data: dailyParams } = await supabase
      .from("payments")
      .select("id, payment_date, insurance_amount, plate")
      .eq("driver_id", driverId)
      .gt("insurance_amount", 0);

    const { data: manualParams } = await supabase
      .from("driver_deposit_movements")
      .select("*")
      .eq("driver_id", driverId);

    const history: any[] = [];

    dailyParams?.forEach((p) => {
      history.push({
        id: `PAY-${p.id}`,
        date: p.payment_date,
        type: "DAILY_PAYMENT",
        concept: "Ahorro Diario (Alquiler)",
        amount: Number(p.insurance_amount),
        notes: `Ref: Pago Placa ${p.plate}`,
        is_manual: false
      });
    });

    manualParams?.forEach((m) => {
      history.push({
        id: `MAN-${m.id}`,
        date: m.created_at,
        type: m.type,
        concept: m.concept,
        amount: Number(m.amount),
        notes: m.notes,
        is_manual: true
      });
    });

    history.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return res.json(history);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. REGISTRAR MOVIMIENTO MANUAL
r.post("/movement", async (req: Request, res: Response) => {
  const { driver_id, amount, concept, notes, created_by } = req.body;

  if (!driver_id || !amount || !notes) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  try {
    const { data, error } = await supabase
      .from("driver_deposit_movements")
      .insert({
        driver_id,
        amount,
        type: "MANUAL_ADJUSTMENT",
        concept,
        notes,
        created_by
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default r;