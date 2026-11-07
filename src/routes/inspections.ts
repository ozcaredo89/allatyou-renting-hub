import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// 1. GET /inspections - Traer historial global (Últimas 100)
// Esta ruta sirve para la tabla maestra de auditoría
r.get("/", async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from("inspections")
            .select("*, driver:drivers(id, full_name, phone)") // Traemos conductor y teléfono
            .order("created_at", { ascending: false })
            .limit(100);
            
        if (error) throw new Error(error.message);
        return res.json(data);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// 2. POST /inspections - Guardar una nueva revisión
r.post("/", async (req: Request, res: Response) => {
  const body = req.body;

  try {
    // Validaciones mínimas
    if (!body.vehicle_plate) return res.status(400).json({ error: "Falta la placa" });
    if (!body.photos || Object.keys(body.photos).length === 0) {
        return res.status(400).json({ error: "Debes subir al menos una foto" });
    }

    const mileageNum = body.mileage !== undefined && body.mileage !== null && body.mileage !== ""
      ? Number(body.mileage)
      : null;

    const validFuelLevels = ["empty", "1/4", "1/2", "3/4", "full"];
    const fuelLevel = body.fuel_level && validFuelLevels.includes(body.fuel_level)
      ? body.fuel_level
      : null;

    const { data, error } = await supabase
      .from("inspections")
      .insert({
        vehicle_plate: String(body.vehicle_plate).toUpperCase().trim(),
        driver_id: body.driver_id || null,
        type: body.type || "general",
        mileage: mileageNum,
        fuel_level: fuelLevel,
        photos: body.photos, // El objeto JSON con las URLs
        comments: body.comments,
        inspector_name: body.inspector_name
      })
      .select("*, driver:drivers(id, full_name, phone)")
      .single();

    if (error) throw new Error(error.message);

    // Si se registró kilometraje válido, sincronizar en vehicle_mileage_logs para telemetría y mantenimientos
    if (mileageNum && !isNaN(mileageNum) && mileageNum > 0) {
      try {
        await supabase.from("vehicle_mileage_logs").insert({
          plate: String(body.vehicle_plate).toUpperCase().trim(),
          mileage_km: mileageNum,
          source: "manual",
          notes: `Inspección de ${body.type || "general"} (ID: ${data.id})`
        });
      } catch (logErr) {
        console.warn("No se pudo insertar en vehicle_mileage_logs (no crítico):", logErr);
      }
    }

    return res.status(201).json(data);
  } catch (err: any) {
    console.error("Error saving inspection:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. GET /inspections/:plate - Ver historial de un carro específico
r.get("/:plate", async (req: Request, res: Response) => {
    const plate = String(req.params.plate || "");

    if (!plate) return res.status(400).json({ error: "Plate required" });
    
    try {
        const { data, error } = await supabase
            .from("inspections")
            .select("*, driver:drivers(id, full_name, phone)")
            .eq("vehicle_plate", plate.toUpperCase())
            .order("created_at", { ascending: false });
            
        if (error) throw new Error(error.message);
        return res.json(data);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// 4. PUT /inspections/:id - Editar una inspección y generar log de auditoría
r.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body;

  try {
    const validFuelLevels = ["empty", "1/4", "1/2", "3/4", "full"];
    const fuelLevel = body.fuel_level && validFuelLevels.includes(body.fuel_level)
      ? body.fuel_level
      : body.fuel_level === null ? null : undefined;

    const mileageNum = body.mileage !== undefined
      ? (body.mileage !== null && body.mileage !== "" ? Number(body.mileage) : null)
      : undefined;

    // A. Preparamos los datos a actualizar en la tabla principal
    const updates: Record<string, any> = {
      photos: body.photos,
      comments: body.comments,
      type: body.type, // Por si cambiaron el tipo (Entrega/Recepción)
    };

    if (fuelLevel !== undefined) updates.fuel_level = fuelLevel;
    if (mileageNum !== undefined) updates.mileage = mileageNum;

    // B. Ejecutamos la actualización
    const { data: updatedInspection, error: updateError } = await supabase
      .from("inspections")
      .update(updates)
      .eq("id", id)
      .select("*, driver:drivers(id, full_name, phone)")
      .single();

    if (updateError) throw new Error(updateError.message);

    // C. Insertamos el LOG de auditoría (Bitácora)
    const logEntry = {
      inspection_id: id,
      actor_name: body.editor_name || "Admin", // Nombre de quien edita
      change_summary: body.change_summary || "Actualización de datos (Edición manual)",
    };

    const { error: logError } = await supabase
      .from("inspection_logs")
      .insert(logEntry);

    // No bloqueamos la respuesta si falla el log, pero lo reportamos en consola
    if (logError) console.error("Error creating log:", logError.message); 

    return res.json({ success: true, inspection: updatedInspection });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. GET /inspections/:id/logs - Ver el historial de cambios (Logs)
r.get("/:id/logs", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from("inspection_logs")
            .select("*")
            .eq("inspection_id", id)
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        return res.json(data);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// 6. Router Público para compartir reporte por WhatsApp (solo lectura por ID sin Basic Auth)
export const publicInspectionsRoutes = Router();
publicInspectionsRoutes.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("inspections")
      .select("id, vehicle_plate, created_at, type, mileage, fuel_level, comments, inspector_name, photos, driver:drivers(full_name)")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Inspección no encontrada" });
    }
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default r;
