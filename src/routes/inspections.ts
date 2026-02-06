import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// 1. GET /inspections - Traer historial global (Últimas 100)
// Esta ruta sirve para la tabla maestra de auditoría
r.get("/", async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from("inspections")
            .select("*, driver:drivers(full_name)") // Traemos el nombre del conductor
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

    const { data, error } = await supabase
      .from("inspections")
      .insert({
        vehicle_plate: body.vehicle_plate,
        driver_id: body.driver_id || null,
        type: body.type || 'general',
        photos: body.photos, // El objeto JSON con las URLs
        comments: body.comments,
        inspector_name: body.inspector_name
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return res.status(201).json(data);
  } catch (err: any) {
    console.error("Error saving inspection:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. GET /inspections/:plate - Ver historial de un carro específico
r.get("/:plate", async (req: Request, res: Response) => {
    const plate = String(req.params.plate || "");

    // Validación simple para evitar colisión con rutas que no sean placas
    // (Aunque por la estructura de URL no debería chocar con /logs si se llama bien)
    if (!plate) return res.status(400).json({ error: "Plate required" });
    
    try {
        const { data, error } = await supabase
            .from("inspections")
            .select("*, driver:drivers(full_name)")
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
    // A. Preparamos los datos a actualizar en la tabla principal
    const updates = {
      photos: body.photos,
      comments: body.comments,
      type: body.type, // Por si cambiaron el tipo (Entrega/Recepción)
      // Nota: No permitimos cambiar vehicle_plate o driver_id para no romper la integridad histórica
    };

    // B. Ejecutamos la actualización
    const { data: updatedInspection, error: updateError } = await supabase
      .from("inspections")
      .update(updates)
      .eq("id", id)
      .select()
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

export default r;