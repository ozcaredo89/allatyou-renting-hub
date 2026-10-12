import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { sendEmail } from "../lib/email";
import { getActiveLeasingContract } from "../lib/leasingCascade";

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

        // --- NUEVOS CAMPOS ---
        photo_url: body.photo_url || null,
        deposit_amount: body.deposit_amount !== undefined ? body.deposit_amount : 300000,
        deposit_receipt_url: body.deposit_receipt_url || null,

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

    // Disparar correo asincrónicamente
    sendEmail({
      to: "oscar.hv89@gmail.com",
      subject: `Nuevo Conductor Registrado: ${data.full_name}`,
      text: `Se ha registrado el conductor ${data.full_name} (CC: ${data.document_number}). Depósito: $${data.deposit_amount || 0}.`,
      html: `<p>Se ha registrado un nuevo conductor en AllAtYou Renting Hub:</p>
            <ul>
              <li><strong>Nombre:</strong> ${data.full_name}</li>
              <li><strong>Documento:</strong> ${data.document_number}</li>
              <li><strong>Teléfono:</strong> ${data.phone}</li>
              <li><strong>Depósito:</strong> $${Number(data.deposit_amount || 0).toLocaleString()} COP</li>
            </ul>
            <p><strong>Comprobante de Depósito:</strong> ${data.deposit_receipt_url ? `<a href="${data.deposit_receipt_url}">Ver Adjunto</a>` : 'No adjuntado.'}</p>`
    }).catch(err => console.error("Error enviando email conductor:", err));

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

      // --- NUEVOS CAMPOS ---
      photo_url: body.photo_url,
      deposit_amount: body.deposit_amount,
      deposit_receipt_url: body.deposit_receipt_url,

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

    // Disparar correo asincrónicamente
    sendEmail({
      to: "oscar.hv89@gmail.com",
      subject: `Expediente Actualizado: ${data.full_name}`,
      text: `Se ha modificado el perfil del conductor ${data.full_name} (CC: ${data.document_number}). Depósito actual: $${data.deposit_amount || 0}.`,
      html: `<p>Se ha editado el perfil del conductor en AllAtYou Renting Hub:</p>
            <ul>
              <li><strong>Nombre:</strong> ${data.full_name}</li>
              <li><strong>Documento:</strong> ${data.document_number}</li>
              <li><strong>Estado:</strong> ${data.status}</li>
              <li><strong>Depósito:</strong> $${Number(data.deposit_amount || 0).toLocaleString()} COP</li>
            </ul>
            <p><strong>Comprobante de Depósito:</strong> ${data.deposit_receipt_url ? `<a href="${data.deposit_receipt_url}">Ver Adjunto</a>` : 'No adjuntado.'}</p>`
    }).catch(err => console.error("Error enviando email update conductor:", err));

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

    // Al promover, copiamos también los documentos si existieran
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
        // Nota: Si en el futuro 'driver_applications' tiene foto, mapeala aquí también:
        // photo_url: app.photo_url 
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

  let hasCredit = Boolean(data.has_credit);
  let defaultAmount = data.default_amount ?? null;
  let defaultInstallment = data.default_installment ?? null;
  let creditDailyInstallment: number | null = null;

  // 1) Determinar tarifa base (Leasing vs Renting)
  let baseDaily = defaultAmount ? Number(defaultAmount) : 70000;
  const leasingContract = await getActiveLeasingContract(plate);
  const isLeasing = !!(leasingContract && !leasingContract.start_date_pending_confirmation);

  if (isLeasing && leasingContract) {
    const { data: nextCuota } = await supabase
      .from("leasing_schedule")
      .select("maintenance_expected, admin_expected, interest_expected, principal_expected")
      .eq("contract_id", leasingContract.id)
      .neq("status", "paid")
      .order("installment_no", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextCuota) {
      baseDaily = Math.round(
        Number(nextCuota.maintenance_expected) +
        Number(nextCuota.admin_expected) +
        Number(nextCuota.interest_expected) +
        Number(nextCuota.principal_expected)
      );
    }
  }

  // 2) Si el vehículo tiene un anticipo operacional activo, reflejarlo automáticamente
  const { data: activeAdv } = await supabase
    .from("operational_advances")
    .select("id, daily_installment, current_installment, installments")
    .eq("plate", plate)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (activeAdv) {
    hasCredit = true;
    creditDailyInstallment = Number(activeAdv.daily_installment || 0);

    // Buscar la siguiente cuota pendiente real en el cronograma
    const { data: nextUnpaid } = await supabase
      .from("operational_advance_schedule")
      .select("installment_no")
      .eq("advance_id", activeAdv.id)
      .neq("status", "paid")
      .order("installment_no", { ascending: true })
      .limit(1)
      .maybeSingle();

    defaultInstallment = nextUnpaid?.installment_no ?? ((activeAdv.current_installment ?? 0) + 1);
    defaultAmount = baseDaily + creditDailyInstallment;
  } else {
    defaultAmount = baseDaily;
  }

  return res.json({
    found: true,
    driver: {
      plate: data.plate,
      driver_name: data.driver_name,
      has_credit: hasCredit,
      base_amount: baseDaily,
      default_amount: defaultAmount,
      default_installment: defaultInstallment,
      credit_daily_installment: creditDailyInstallment,
      is_leasing: isLeasing,
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