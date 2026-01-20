import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /vehicles
 * Lista la flota completa con datos técnicos y el conductor asignado.
 */
r.get("/", async (req: Request, res: Response) => {
  try {
    // Hacemos JOIN con la tabla 'drivers' usando la FK 'current_driver_id'
    // La sintaxis driver:drivers!current_driver_id significa:
    // "Trae la relación 'drivers', usa la FK 'current_driver_id' y llámalo 'driver' en el JSON"
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
 * PUT /vehicles/:plate
 * Actualiza la hoja de vida del vehículo (incluyendo asignar/cambiar conductor).
 */
r.put("/:plate", async (req: Request, res: Response) => {
  const { plate } = req.params;
  const body = req.body;

  try {
    // Mapeo explícito de campos para evitar errores de seguridad
    const updates = {
      // Datos de Identificación
      brand: body.brand,
      line: body.line,
      model_year: body.model_year,
      
      // Asignación (Aquí ocurre la magia de asignar conductor)
      current_driver_id: body.current_driver_id, 
      
      // Seguridad / Legal
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
      
      updated_at: new Date().toISOString(),
    };

    // Eliminamos propiedades undefined para no sobrescribir con null accidentalmente
    // (Aunque en este caso queremos permitir null si el usuario borra el dato)
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