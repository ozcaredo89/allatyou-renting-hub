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

export default r;