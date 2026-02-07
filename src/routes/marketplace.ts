import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /marketplace/catalog
 * Público. Trae los carros DISPONIBLES para rentar.
 * Filtra por status = 'approved'.
 */
r.get("/catalog", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("marketplace_cars")
      .select("id, brand, model, year, transmission, price_per_day, photo_exterior_url, owner_city")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /marketplace/upload
 * Público. Permite a un dueño subir su vehículo para revisión.
 */
r.post("/upload", async (req: Request, res: Response) => {
  const body = req.body;

  try {
    // Validaciones básicas
    if (!body.owner_name || !body.owner_phone || !body.brand || !body.plate) {
      return res.status(400).json({ error: "Faltan datos obligatorios." });
    }

    const { data, error } = await supabase
      .from("marketplace_cars")
      .insert({
        owner_name: body.owner_name,
        owner_phone: body.owner_phone,
        owner_email: body.owner_email,
        owner_city: body.owner_city,
        brand: body.brand,
        model: body.model,
        year: parseInt(body.year),
        transmission: body.transmission,
        fuel_type: body.fuel_type,
        plate: body.plate.toUpperCase(),
        price_per_day: body.price_per_day || 0, // Se puede ajustar luego
        photo_exterior_url: body.photo_exterior_url,
        photo_interior_url: body.photo_interior_url,
        status: "pending" // Siempre entra como pendiente
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return res.status(201).json({ success: true, car: data });
  } catch (err: any) {
    console.error("Error uploading car:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN ENDPOINTS (Para tu panel de moderación futuro) ---

// GET /marketplace/admin/pending (Solo admins deberían ver esto)
r.get("/admin/all", async (req: Request, res: Response) => {
    // Aquí deberías validar Auth, lo haremos en la integración
    const { data, error } = await supabase
        .from("marketplace_cars")
        .select("*")
        .order("created_at", { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
});

// PUT /marketplace/admin/:id/status (Aprobar/Rechazar)
r.put("/admin/:id/status", async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body; // 'approved' | 'rejected'

    const { data, error } = await supabase
        .from("marketplace_cars")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
});

export default r;