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
    // 1. Validación básica
    if (!body.plate) {
      return res.status(400).json({ error: "La placa es obligatoria." });
    }

    // 2. Normalizamos la placa
    const cleanPlate = body.plate.trim().toUpperCase().replace(/\s/g, "");

    // 3. Lógica de Sincronización de Nombre (Owner Name)
    let ownerName = "SIN CONDUCTOR ASIGNADO"; // Valor por defecto

    if (body.current_driver_id) {
      const { data: driverInfo } = await supabase
        .from("drivers")
        .select("full_name")
        .eq("id", body.current_driver_id)
        .single();
      
      if (driverInfo) {
        ownerName = driverInfo.full_name;
      }
    }

    // 4. Objeto para insertar
    const newVehicle = {
      plate: cleanPlate,
      brand: body.brand,
      line: body.line,
      model_year: body.model_year,
      
      current_driver_id: body.current_driver_id || null, 
      owner_name: ownerName, 

      // Legal & Seguridad
      alarm_code: body.alarm_code,
      soat_expires_at: body.soat_expires_at,
      tecno_expires_at: body.tecno_expires_at,
      extinguisher_expiry: body.extinguisher_expiry,
      gps_renewal_date: body.gps_renewal_date, // <--- NUEVO CAMPO GPS

      // Mantenimiento
      timing_belt_last_date: body.timing_belt_last_date,
      timing_belt_last_km: body.timing_belt_last_km,
      battery_brand: body.battery_brand,
      battery_install_date: body.battery_install_date,
      tires_notes: body.tires_notes,
      
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Eliminamos undefineds para que Postgres use defaults si aplica (o null)
    const cleanInsert = Object.fromEntries(
      Object.entries(newVehicle).filter(([_, v]) => v !== undefined)
    );

    const { data, error } = await supabase
      .from("vehicles")
      .insert(cleanInsert)
      .select()
      .single();

    if (error) {
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
 * Actualiza la hoja de vida del vehículo y sincroniza el conductor.
 */
r.put("/:plate", async (req: Request, res: Response) => {
  const { plate } = req.params;
  const body = req.body;

  try {
    // 1. Preparar objeto base de actualizaciones
    const updates: any = {
      brand: body.brand,
      line: body.line,
      model_year: body.model_year,
      current_driver_id: body.current_driver_id,
      
      // Legal & Seguridad
      alarm_code: body.alarm_code,
      soat_expires_at: body.soat_expires_at,
      tecno_expires_at: body.tecno_expires_at,
      extinguisher_expiry: body.extinguisher_expiry,
      gps_renewal_date: body.gps_renewal_date, // <--- NUEVO CAMPO GPS
      
      // Mantenimiento
      timing_belt_last_date: body.timing_belt_last_date,
      timing_belt_last_km: body.timing_belt_last_km,
      battery_brand: body.battery_brand,
      battery_install_date: body.battery_install_date,
      tires_notes: body.tires_notes,
      
      updated_at: new Date().toISOString(),
    };

    // 2. Lógica de Sincronización de nombre (Si cambia el driver)
    if (body.current_driver_id !== undefined) {
      if (body.current_driver_id === null) {
        updates.owner_name = "SIN CONDUCTOR ASIGNADO";
      } else {
        const { data: driverInfo } = await supabase
          .from("drivers")
          .select("full_name")
          .eq("id", body.current_driver_id)
          .single();
        
        if (driverInfo) {
          updates.owner_name = driverInfo.full_name;
        }
      }
    }

    // 3. Limpieza de undefineds
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