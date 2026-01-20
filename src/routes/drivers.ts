import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

// ==========================================
// NUEVAS RUTAS: GESTIÓN DE CONDUCTORES (Admin)
// Usan la tabla nueva 'public.drivers'
// ==========================================

/**
 * GET /drivers
 * Lista todos los conductores ACTIVOS de la tabla maestra.
 * Se usa para llenar el dropdown en AdminVehicles.
 */
r.get("/", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("drivers")
      .select("id, full_name, document_number, phone, status")
      .eq("status", "active")
      .order("full_name", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

/**
 * POST /drivers/promote/:applicationId
 * Promueve un candidato a conductor oficial.
 */
r.post("/promote/:applicationId", async (req: Request, res: Response) => {
  const { applicationId } = req.params;
  try {
    // 1. Obtener datos del candidato
    const { data: app, error: appErr } = await supabase
      .from("driver_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (appErr || !app) return res.status(404).json({ error: "Application not found" });

    // 2. Crear conductor
    const { data: driver, error: createErr } = await supabase
      .from("drivers")
      .insert({
        full_name: app.full_name,
        document_number: app.document_number,
        date_of_birth: app.date_of_birth,
        phone: app.phone_mobile,
        email: app.email,
        address: app.address,
        application_id: app.id,
        status: "active"
      })
      .select()
      .single();

    if (createErr) return res.status(500).json({ error: createErr.message });

    // 3. Actualizar CRM
    await supabase
      .from("driver_applications")
      .update({ status: "approved", status_reason: "Promoted to Driver" })
      .eq("id", applicationId);

    return res.json({ success: true, driver });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});


// ==========================================
// RUTA LEGACY: OPERACIÓN DE PAGOS
// Usa la vista 'drivers_vw'
// ==========================================

/** * GET /drivers/:plate
 * Devuelve datos del conductor por placa (para pagos/autocompletar). 
 */
r.get("/:plate", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase().trim();

  if (!PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "invalid plate format (ABC123)" });
  }

  // IMPORTANTE: la fuente actual es la VIEW legacy public.drivers_vw
  const { data, error } = await supabase
    .from("drivers_vw")
    .select("plate, driver_name, has_credit, default_amount, default_installment")
    .eq("plate", plate)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) return res.status(404).json({ found: false });

  return res.json({
    found: true,
    driver: {
      plate: data.plate,
      driver_name: data.driver_name,
      has_credit: Boolean(data.has_credit),
      default_amount: data.default_amount ?? null,
      default_installment: data.default_installment ?? null,
    },
  });
});

export default r;