import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// 1. RESUMEN: Listado de conductores con su saldo total calculado
r.get("/", async (req: Request, res: Response) => {
  try {
    // CORRECCIÓN: 
    // 1. Usamos 'status' que SÍ existe en tu tabla.
    // 2. Quitamos 'active_vehicle_id' que NO existe.
    // 3. Traemos 'vehicles(plate)' asumiendo que vehicles tiene foreign key hacia drivers.
    const { data: drivers, error: errDrivers } = await supabase
      .from("drivers")
      .select("id, full_name, status, vehicles(plate)")
      .order("full_name");

    if (errDrivers) throw new Error(errDrivers.message);

    // B. Traer la suma de seguros pagados por conductor
    const { data: payments } = await supabase
      .from("payments")
      .select("driver_id, insurance_amount")
      .gt("insurance_amount", 0)
      .not("driver_id", "is", null);

    // C. Traer la suma de movimientos manuales
    const { data: movements } = await supabase
      .from("driver_deposit_movements")
      .select("driver_id, amount");

    // D. Calcular saldos en memoria
    const saldoMap = new Map<number, number>();

    payments?.forEach((p) => {
      const current = saldoMap.get(p.driver_id) || 0;
      saldoMap.set(p.driver_id, current + Number(p.insurance_amount));
    });

    movements?.forEach((m) => {
      const current = saldoMap.get(m.driver_id) || 0;
      saldoMap.set(m.driver_id, current + Number(m.amount));
    });

    // E. Armar respuesta final
    const report = drivers.map((d: any) => {
      // Manejo seguro de la placa (Supabase devuelve array en relaciones inversas)
      let plate = "Sin Asignar";
      if (d.vehicles) {
         if (Array.isArray(d.vehicles) && d.vehicles.length > 0) {
            plate = d.vehicles[0].plate;
         } else if (!Array.isArray(d.vehicles) && d.vehicles.plate) {
            plate = d.vehicles.plate;
         }
      }

      return {
        id: d.id,
        full_name: d.full_name,
        vehicle_plate: plate,
        // Usamos el status real de tu DB
        is_active: d.status === 'active', 
        total_balance: saldoMap.get(d.id) || 0,
      };
    });

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