import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

/**
 * GET /drivers
 * Lista conductores.
 * - ?all=true -> Trae TODOS (para el panel admin).
 * - (sin params) -> Trae SOLO ACTIVOS (para dropdowns).
 */
r.get("/", async (req: Request, res: Response) => {
  try {
    let query = supabase
      .from("drivers")
      .select("*")
      .order("full_name", { ascending: true });

    // Si NO piden "all", filtramos solo los activos (comportamiento default)
    if (req.query.all !== "true") {
      query = query.eq("status", "active");
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

/**
 * POST /drivers
 * Crea un conductor manualmente (Directo, sin postulación).
 */
r.post("/", async (req: Request, res: Response) => {
  const body = req.body;
  try {
    // Validaciones mínimas
    if (!body.full_name || !body.document_number || !body.phone) {
      return res.status(400).json({ error: "Nombre, Documento y Teléfono son obligatorios." });
    }

    const { data, error } = await supabase
      .from("drivers")
      .insert({
        // Datos Personales
        full_name: body.full_name.toUpperCase(),
        document_number: body.document_number,
        phone: body.phone,
        email: body.email || null,
        address: body.address || null,
        date_of_birth: body.date_of_birth || null,
        notes: body.notes || null,
        status: body.status || "active",
        
        // Documentación (URLs)
        cv_url: body.cv_url || null,
        id_front_url: body.id_front_url || null,
        id_back_url: body.id_back_url || null,
        license_front_url: body.license_front_url || null,
        license_back_url: body.license_back_url || null,
        contract_url: body.contract_url || null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: "Ya existe un conductor con este documento." });
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

/**
 * PUT /drivers/:id
 * Actualiza datos de un conductor.
 */
r.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body;

  try {
    const updates = {
      // Datos Personales
      full_name: body.full_name?.toUpperCase(),
      document_number: body.document_number,
      phone: body.phone,
      email: body.email,
      address: body.address,
      date_of_birth: body.date_of_birth,
      notes: body.notes,
      status: body.status,
      
      // Documentación (URLs)
      cv_url: body.cv_url,
      id_front_url: body.id_front_url,
      id_back_url: body.id_back_url,
      license_front_url: body.license_front_url,
      license_back_url: body.license_back_url,
      contract_url: body.contract_url,

      updated_at: new Date().toISOString()
    };

    // Limpieza de undefined (solo actualiza lo que venga en el body)
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    const { data, error } = await supabase
      .from("drivers")
      .update(cleanUpdates)
      .eq("id", id)
      .select()
      .single();

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
    const { data: app, error: appErr } = await supabase
      .from("driver_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (appErr || !app) return res.status(404).json({ error: "Application not found" });

    // Al promover, copiamos también los documentos si existieran en la postulación
    // (Asumiendo que driver_applications tiene campos similares o se mapean aquí)
    // Por ahora mapeamos lo básico que existía.
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
        // Si driver_applications tuviera PDF, aquí se mapearían:
        // cv_url: app.cv_url ...
      })
      .select()
      .single();

    if (createErr) return res.status(500).json({ error: createErr.message });

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
// RUTA LEGACY: OPERACIÓN DE PAGOS (INTACTA)
// ==========================================

r.get("/:plate", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase().trim();

  if (!PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "invalid plate format (ABC123)" });
  }

  const { data, error } = await supabase
    .from("drivers_vw")
    .select("plate, driver_name, has_credit, default_amount, default_installment")
    .eq("plate", plate)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
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

/**
 * PATCH /drivers/:id/contact
 * Actualización rápida de contacto (Teléfono/Email) para módulo de cobranza.
 */
r.patch("/:id/contact", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { phone } = req.body;

  if (!phone) return res.status(400).json({ error: "Teléfono requerido" });

  try {
    const { data, error } = await supabase
      .from("drivers")
      .update({ phone, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, full_name, phone")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, driver: data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

export default r;