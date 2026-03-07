import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /vehicles
 * Lista la flota completa con datos técnicos, conductor asignado E INVERSIONES.
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
        ),
        vehicle_investments (
          amount,
          date,
          concept
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
 * Registra un nuevo vehículo en la flota e inserta la inversión inicial.
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
      gps_renewal_date: body.gps_renewal_date,

      // Mantenimiento
      timing_belt_last_date: body.timing_belt_last_date,
      timing_belt_last_km: body.timing_belt_last_km,
      battery_brand: body.battery_brand,
      battery_install_date: body.battery_install_date,
      tires_notes: body.tires_notes,
      gps_imei: body.gps_imei,

      // Documentos
      ownership_card_front: body.ownership_card_front,
      ownership_card_back: body.ownership_card_back,

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
      if (error.code === '23505') {
        return res.status(409).json({ error: "Ya existe un vehículo con esta placa." });
      }
      return res.status(500).json({ error: error.message });
    }

    // --- NUEVA LÓGICA: Inversión Inicial (CREATE) ---
    if (body.purchase_price && Number(body.purchase_price) > 0) {
      const { error: errInv } = await supabase
        .from("vehicle_investments")
        .insert({
          plate: cleanPlate,
          date: body.purchase_date || new Date().toISOString().slice(0, 10),
          concept: 'Inicial',
          amount: Number(body.purchase_price)
        });

      if (errInv) {
        console.error("Error creando inversión inicial:", errInv.message);
      }
    }
    // ---------------------------------------

    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

/**
 * PUT /vehicles/:plate
 * Actualiza vehículo E INVERSIÓN INICIAL.
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
      gps_renewal_date: body.gps_renewal_date,

      // Mantenimiento
      timing_belt_last_date: body.timing_belt_last_date,
      timing_belt_last_km: body.timing_belt_last_km,
      battery_brand: body.battery_brand,
      battery_install_date: body.battery_install_date,
      tires_notes: body.tires_notes,
      gps_imei: body.gps_imei,

      // Documentos
      ownership_card_front: body.ownership_card_front,
      ownership_card_back: body.ownership_card_back,

      updated_at: new Date().toISOString(),
    };

    // 2. Sincronización de nombre
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

    // --- NUEVA LÓGICA: Inversión Inicial (UPDATE) ---
    // Si envían precio, actualizamos o insertamos el registro 'Inicial'
    if (body.purchase_price && Number(body.purchase_price) > 0) {
      // Primero intentamos actualizar si ya existe
      const { data: existing } = await supabase
        .from("vehicle_investments")
        .select("id")
        .eq("plate", plate)
        .eq("concept", "Inicial")
        .maybeSingle();

      if (existing) {
        // Update
        await supabase.from("vehicle_investments")
          .update({
            amount: Number(body.purchase_price),
            date: body.purchase_date || new Date().toISOString().slice(0, 10)
          })
          .eq("id", existing.id);
      } else {
        // Insert (Caso raro: vehículo viejo sin inversión registrada que se edita por primera vez)
        await supabase.from("vehicle_investments")
          .insert({
            plate: plate,
            date: body.purchase_date || new Date().toISOString().slice(0, 10),
            concept: 'Inicial',
            amount: Number(body.purchase_price)
          });
      }
    }
    // ---------------------------------------

    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// ==========================================
// MÓDULO DE KILOMETRAJE
// ==========================================

// GET HISTORY
r.get("/:plate/mileage", async (req: Request, res: Response) => {
  try {
    const period = req.query.period as string || "all"; // 'day', 'week', 'month', 'year', 'all'
    let query = supabase
      .from("vehicle_mileage_logs")
      .select("*")
      .eq("plate", req.params.plate)
      .order("recorded_at", { ascending: false });

    // Filtrar opcionalmente por rangos si mandan begin/end en formato YYYY-MM-DD
    if (req.query.begin) query = query.gte("recorded_at", req.query.begin);
    if (req.query.end) query = query.lte("recorded_at", req.query.end);

    // Si mandan límite por simplicidad
    if (req.query.limit) query = query.limit(Number(req.query.limit));

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// POST MANUAL RECORD
r.post("/:plate/mileage", async (req: Request, res: Response) => {
  try {
    const { mileage_km, recorded_at, notes } = req.body;

    if (mileage_km === undefined || isNaN(Number(mileage_km))) {
      return res.status(400).json({ error: "mileage_km es requerido y debe ser número" });
    }

    const insertion = {
      plate: req.params.plate,
      mileage_km: Number(mileage_km),
      recorded_at: recorded_at || new Date().toISOString(),
      source: "manual",
      notes: notes || null
    };

    const { data, error } = await supabase
      .from("vehicle_mileage_logs")
      .insert(insertion)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

export default r;