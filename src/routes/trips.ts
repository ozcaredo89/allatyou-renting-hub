import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import rateLimit from "express-rate-limit";
import { sendEmail } from "../lib/email";
import { basicAuth } from "../middleware/basicAuth";

const r = Router();

// Rate limiting for public trip creation
// Limit to 5 requests per 15 minutes per IP
const tripCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5,
  message: { error: "Demasiadas solicitudes de cotización creadas desde esta IP, por favor intente de nuevo más tarde." },
  skip: (req) => req.method === "OPTIONS",
});

// PUBLIC: Crear un viaje (Cliente)
r.post("/", tripCreationLimiter, async (req: Request, res: Response) => {
  try {
    const { 
      client_phone, client_email, origin_address, origin_lat, origin_lng,
      dest_address, dest_lat, dest_lng, distance_km, pickup_time, recurrence,
      waypoints = []
    } = req.body;

    if (!client_phone || !origin_address || !dest_address) {
      return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    const { data, error } = await supabase.from("trips").insert([{
      client_phone, client_email, origin_address, origin_lat, origin_lng,
      dest_address, dest_lat, dest_lng, distance_km, pickup_time, recurrence,
      status: "pending",
      waypoints
    }]).select().single();

    if (error) throw error;

    // Send email notification to admin
    try {
      const waypointsText = waypoints.length > 0 
        ? `\nParadas intermedias: ${waypoints.map((wp: any, i: number) => `\n  ${i + 1}. ${wp.address}`).join("")}` 
        : "";

      await sendEmail({
        to: "oscar.hv89@gmail.com",
        subject: "🚗 Nuevo Viaje / Ruta Solicitada",
        text: `Se ha solicitado un nuevo viaje.\n\nOrigen: ${origin_address}${waypointsText}\nDestino: ${dest_address}\nDistancia: ${distance_km}km\nTeléfono Cliente: ${client_phone}\n\nRevisa el panel administrativo para enviarlo a los conductores.`,
      });
    } catch (emailErr) {
      console.error("Error enviando email de notificación de viaje:", emailErr);
    }

    res.json({ success: true, trip: data });
  } catch (err: any) {
    console.error("Error creating trip:", err);
    res.status(500).json({ error: err.message });
  }
});

// PROTECTED: Lista de viajes (Admin)
r.get("/", basicAuth, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC: Ver detalles públicos de un viaje (Conductor)
r.get("/:id/public", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("trips")
      .select("id, origin_address, dest_address, distance_km, pickup_time, status, waypoints")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Viaje no encontrado" });
    
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC: Crear una oferta para un viaje (Conductor)
r.post("/:id/offers", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { driver_name, driver_phone, offer_amount } = req.body;

    if (!driver_name || !driver_phone || !offer_amount) {
      return res.status(400).json({ error: "Faltan datos obligatorios para la oferta" });
    }

    const { data, error } = await supabase.from("trip_offers").insert([{
      trip_id: id,
      driver_name,
      driver_phone,
      offer_amount
    }]).select().single();

    if (error) throw error;
    res.json({ success: true, offer: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PROTECTED: Lista de ofertas para un viaje (Admin)
r.get("/:id/offers", basicAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("trip_offers")
      .select("*")
      .eq("trip_id", id)
      .order("offer_amount", { ascending: true }); // Subasta inversa

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PROTECTED: Asignar un conductor a un viaje (Aceptar oferta)
r.post("/:id/assign/:offerId", basicAuth, async (req: Request, res: Response) => {
  try {
    const { id, offerId } = req.params;

    // 1. Marcar el viaje como asignado
    const { data: trip, error: updateErr } = await supabase
      .from("trips")
      .update({ status: "assigned" })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // 2. Obtener los detalles de la oferta para responder
    const { data: offer, error: offerErr } = await supabase
      .from("trip_offers")
      .select("*")
      .eq("id", offerId)
      .single();
      
    if (offerErr) throw offerErr;

    res.json({ success: true, trip, offer });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default r;
