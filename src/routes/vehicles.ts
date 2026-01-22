import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /vehicles
 * Lista la flota completa con datos técnicos y el conductor asignado.
 */
r.get("/", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("vehicles")
      .select(`
        *,
        driver:drivers!current_driver_id (
          id,
          full_name,
          phone
        )
      `)
      .order("plate", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

/**
 * POST /vehicles
 * Registra un nuevo vehículo en la flota.
 */
r.post("/", async (req: Request, res: Response) => {
  const body = req.body;

  try {
    // Validación básica
    if (!body.plate) {
      return res.status(400).json({ error: "La placa es obligatoria." });
    }

    // Normalizamos la placa (Mayúsculas y sin espacios)
    const cleanPlate = body.plate.trim().toUpperCase().replace(/\s/g, "");

    // Objeto para insertar
    const newVehicle = {
      plate: cleanPlate,
      brand: body.brand,
      line: body.line,
      model_year: body.model_year,
      
      // Asignación inicial (opcional)
      current_driver_id: body.current_driver_id || null, 
      
      // Legal
      alarm_code: body.alarm_code,
      soat_expires_at: body.soat_expires_at,
      tecno_expires_at: body.tecno_expires_at,
      extinguisher_expiry: body.extinguisher_expiry,
      
      // Mantenimiento
      timing_belt_last_date: body.timing_belt_last_date,
      timing_belt_last_km: body.timing_belt_last_km,
      battery_brand: body.battery_brand,
      battery_install_date: body.battery_install_date,
      tires_notes: body.tires_notes,
      
      // Campos de auditoría
      owner_name: "AllAtYou Renting", // Valor por defecto
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Eliminamos undefineds
    const cleanInsert = Object.fromEntries(
      Object.entries(newVehicle).filter(([_, v]) => v !== undefined)
    );

    const { data, error } = await supabase
      .from("vehicles")
      .insert(cleanInsert)
      .select()
      .single();

    if (error) {
      // Manejo de duplicados (Error 23505 en Postgres)
      if (error.code === '23505') {
        return res.status(409).json({ error: "Ya existe un vehículo con esta placa." });
      }
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

/**
 * PUT /vehicles/:plate
 * Actualiza la hoja de vida del vehículo.
 */
r.put("/:plate", async (req: Request, res: Response) => {
  const { plate } = req.params;
  const body = req.body;

  try {
    const updates = {
      brand: body.brand,
      line: body.line,
      model_year: body.model_year,
      current_driver_id: body.current_driver_id,
      alarm_code: body.alarm_code,
      soat_expires_at: body.soat_expires_at,
      tecno_expires_at: body.tecno_expires_at,
      extinguisher_expiry: body.extinguisher_expiry,
      timing_belt_last_date: body.timing_belt_last_date,
      timing_belt_last_km: body.timing_belt_last_km,
      battery_brand: body.battery_brand,
      battery_install_date: body.battery_install_date,
      tires_notes: body.tires_notes,
      updated_at: new Date().toISOString(),
    };

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    const { data, error } = await supabase
      .from("vehicles")
      .update(cleanUpdates)
      .eq("plate", plate)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

export default r;