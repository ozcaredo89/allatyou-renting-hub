// src/routes/driverApplications.ts
import { basicAuth } from "../middleware/basicAuth";
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { sendEmail } from "../lib/email";

const r = Router();

const REQUIRED_DOC_KINDS = [
  "driver_selfie",
  "id_front_photo",
  "id_back_photo",
  "license_front_photo",
  "license_back_photo",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE_STATUSES = new Set(["registered", "pending_review"]);

/**
 * Helpers de validación
 */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isEmail(v: unknown): v is string {
  if (!isNonEmptyString(v)) return false;
  // Simple y suficiente para backend; el frontend puede ser más estricto.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isISODate(v: unknown): v is string {
  if (!isNonEmptyString(v)) return false;
  // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return false;
  const d = new Date(v.trim() + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

function calcAge(dateISO: string): number {
  const dob = new Date(dateISO + "T00:00:00Z");
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function normalizePhone(v: string): string {
  // Conserva + y números. Quita espacios y guiones.
  return v.replace(/[^\d+]/g, "");
}

function normalizeDoc(v: string): string {
  return v.trim();
}

type FieldIssue = { path: string; issue: string };

function validationError(res: Response, fields: FieldIssue[]) {
  const issuesList = fields.map(f => `${f.path}: ${f.issue}`).join(", ");
  return res.status(422).json({
    error: "validation_error",
    message: `Campos inválidos o incompletos: ${issuesList}`,
    fields,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEditUrl(editToken: string): string {
  return `https://www.allatyou.com/postulacion/editar/${editToken}`;
}

async function sendApplicantConfirmationEmail(params: {
  to: string;
  fullName: string;
  documentNumber: string;
  phoneMobile: string;
  address: string;
  dateOfBirth: string;
  licenseNumberCat: string;
  drivingExpTime: string;
  editToken: string;
  isUpdate?: boolean;
}) {
  const editUrl = buildEditUrl(params.editToken);
  const subject = params.isUpdate
    ? "Actualización de tu postulación como conductor — AllAtYou Renting"
    : "Confirmación de postulación como conductor — AllAtYou Renting";

  const intro = params.isUpdate
    ? "Hemos guardado los cambios de tu postulación como conductor en AllAtYou Renting."
    : "¡Recibimos tu postulación como conductor en AllAtYou Renting! Revisa que todos tus datos estén correctos:";

  const text = `${intro}

Resumen de tus datos:
- Nombre: ${params.fullName}
- Cédula: ${params.documentNumber}
- Fecha de nacimiento: ${params.dateOfBirth}
- Celular: ${params.phoneMobile}
- Correo: ${params.to}
- Dirección: ${params.address}
- Categoría de licencia: ${params.licenseNumberCat}
- Experiencia conduciendo: ${params.drivingExpTime}

Si necesitas corregir algún dato (por ejemplo tu dirección o teléfono) o actualizar tus fotos/documentos mientras tu postulación está en revisión, ingresa aquí:
${editUrl}
`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; line-height: 1.5;">
      <h2 style="color: #059669; margin-bottom: 8px;">${params.isUpdate ? "Postulación actualizada" : "¡Postulación recibida!"}</h2>
      <p>${escapeHtml(intro)}</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Nombre:</strong> ${escapeHtml(params.fullName)}</p>
        <p style="margin: 4px 0;"><strong>Cédula:</strong> ${escapeHtml(params.documentNumber)}</p>
        <p style="margin: 4px 0;"><strong>Fecha de nacimiento:</strong> ${escapeHtml(params.dateOfBirth)}</p>
        <p style="margin: 4px 0;"><strong>Celular:</strong> ${escapeHtml(params.phoneMobile)}</p>
        <p style="margin: 4px 0;"><strong>Correo:</strong> ${escapeHtml(params.to)}</p>
        <p style="margin: 4px 0;"><strong>Dirección:</strong> ${escapeHtml(params.address)}</p>
        <p style="margin: 4px 0;"><strong>Categoría de licencia:</strong> ${escapeHtml(params.licenseNumberCat)}</p>
        <p style="margin: 4px 0;"><strong>Experiencia conduciendo:</strong> ${escapeHtml(params.drivingExpTime)}</p>
      </div>
      <p>Si algún dato quedó mal escrito (por ejemplo tu dirección o teléfono) o deseas actualizar tus fotos mientras revisamos tu postulación, puedes editarla aquí:</p>
      <p style="margin: 20px 0;">
        <a href="${editUrl}" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 20px; border-radius: 8px;">
          Revisar o corregir mi postulación
        </a>
      </p>
      <p style="font-size: 12px; color: #64748b;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>${editUrl}</p>
    </div>
  `;

  try {
    await sendEmail({ to: params.to, subject, text, html });
  } catch (err) {
    console.error("Error sending driver application confirmation email:", err);
  }
}

function validateAndNormalizeApplication(body: any) {
  const fields: FieldIssue[] = [];

  const personal = body.personal ?? {};
  const workExperience = body.workExperience ?? {};
  const license = body.license ?? {};
  const responsibilities = body.responsibilities ?? {};
  const substances = body.substances ?? {};
  const confirmations = body.confirmations ?? {};
  const references = Array.isArray(body.references) ? body.references : [];
  const documents = Array.isArray(body.documents) ? body.documents : [];
  const referral = body.referral ?? {};
  const client = body.client ?? {};

  // Personal
  const fullName = personal.fullName;
  if (!isNonEmptyString(fullName) || fullName.trim().length < 5 || fullName.trim().length > 120) {
    fields.push({ path: "personal.fullName", issue: "required_min_5_max_120" });
  }

  const documentNumberRaw = personal.documentNumber;
  if (!isNonEmptyString(documentNumberRaw) || documentNumberRaw.trim().length < 5 || documentNumberRaw.trim().length > 30) {
    fields.push({ path: "personal.documentNumber", issue: "required_min_5_max_30" });
  } else if (!/^[0-9A-Za-z.\-]+$/.test(documentNumberRaw.trim())) {
    fields.push({ path: "personal.documentNumber", issue: "invalid_characters" });
  }

  const dateOfBirth = personal.dateOfBirth;
  if (!isISODate(dateOfBirth)) {
    fields.push({ path: "personal.dateOfBirth", issue: "invalid_iso_date" });
  } else {
    const age = calcAge(dateOfBirth.trim());
    if (age < 18) fields.push({ path: "personal.dateOfBirth", issue: "must_be_18_or_older" });
  }

  const phoneMobileRaw = personal.phoneMobile;
  if (!isNonEmptyString(phoneMobileRaw) || phoneMobileRaw.trim().length < 7 || phoneMobileRaw.trim().length > 20) {
    fields.push({ path: "personal.phoneMobile", issue: "required_min_7_max_20" });
  }

  const emailRaw = personal.email;
  if (!isEmail(emailRaw) || emailRaw.trim().length > 180) {
    fields.push({ path: "personal.email", issue: "invalid_email_or_too_long" });
  }

  const address = personal.address;
  if (!isNonEmptyString(address) || address.trim().length < 8 || address.trim().length > 250) {
    fields.push({ path: "personal.address", issue: "required_min_8_max_250" });
  }

  // Work
  const hasCommercialExp = typeof workExperience.hasCommercialExp === "boolean" ? workExperience.hasCommercialExp : false;
  const drivingExpTime = workExperience.drivingExpTime;
  if (!isNonEmptyString(drivingExpTime) || drivingExpTime.trim().length < 1 || drivingExpTime.trim().length > 80) {
    fields.push({ path: "workExperience.drivingExpTime", issue: "required_min_1_max_80" });
  }
  const similarJobExp = isNonEmptyString(workExperience.similarJobExp)
    ? workExperience.similarJobExp.trim()
    : "Sin experiencia previa especificada";

  // License (obligatoria y vigente)
  const hasValidLicense = license.hasValidLicense;
  if (hasValidLicense !== true) {
    fields.push({ path: "license.hasValidLicense", issue: "must_be_true" });
  }

  const licenseNumberCat = license.licenseNumberCat;
  if (!isNonEmptyString(licenseNumberCat) || licenseNumberCat.trim().length < 2 || licenseNumberCat.trim().length > 80) {
    fields.push({ path: "license.licenseNumberCat", issue: "required_min_2_max_80" });
  }

  const familiarWithVehicle = license.familiarWithVehicle;
  const familiarWithVehicleOther = license.familiarWithVehicleOther;
  const allowedFamiliar = ["Sí", "No", "Otro"];
  if (!isNonEmptyString(familiarWithVehicle) || !allowedFamiliar.includes(familiarWithVehicle.trim())) {
    fields.push({ path: "license.familiarWithVehicle", issue: "must_be_Sí_No_Otro" });
  } else if (familiarWithVehicle.trim() === "Otro") {
    if (!isNonEmptyString(familiarWithVehicleOther) || familiarWithVehicleOther.trim().length < 2) {
      fields.push({ path: "license.familiarWithVehicleOther", issue: "required_when_familiarWithVehicle_Otro" });
    }
  } else if (familiarWithVehicleOther != null && String(familiarWithVehicleOther).trim() !== "") {
    fields.push({ path: "license.familiarWithVehicleOther", issue: "must_be_null_unless_Otro" });
  }

  // Responsibilities
  const willingBasicMaintenance = responsibilities.willingBasicMaintenance;
  if (typeof willingBasicMaintenance !== "boolean") {
    fields.push({ path: "responsibilities.willingBasicMaintenance", issue: "required_boolean" });
  }
  const weeklyDeliveryCommitment = responsibilities.weeklyDeliveryCommitment;
  if (typeof weeklyDeliveryCommitment !== "boolean") {
    fields.push({ path: "responsibilities.weeklyDeliveryCommitment", issue: "required_boolean" });
  }

  // Substances
  const substanceUseLast6Months = substances.substanceUseLast6Months;
  if (typeof substanceUseLast6Months !== "boolean") {
    fields.push({ path: "substances.substanceUseLast6Months", issue: "required_boolean" });
  }
  const substanceDetails = substances.substanceDetails;
  if (substanceUseLast6Months === true && substanceDetails != null && isNonEmptyString(substanceDetails) && substanceDetails.trim().length > 800) {
    fields.push({ path: "substances.substanceDetails", issue: "max_800" });
  }
  const toxicologyTestConsent = substances.toxicologyTestConsent;
  if (typeof toxicologyTestConsent !== "boolean") {
    fields.push({ path: "substances.toxicologyTestConsent", issue: "required_boolean" });
  }

  // Confirmations
  if (confirmations.acceptsWorkConditions !== true) fields.push({ path: "confirmations.acceptsWorkConditions", issue: "must_be_true" });
  if (confirmations.understandsDamageLiability !== true) fields.push({ path: "confirmations.understandsDamageLiability", issue: "must_be_true" });
  if (confirmations.truthDeclarationAccepted !== true) fields.push({ path: "confirmations.truthDeclarationAccepted", issue: "must_be_true" });

  // References (2 mínimo)
  if (!Array.isArray(references) || references.length < 2) {
    fields.push({ path: "references", issue: "min_2_required" });
  } else {
    references.slice(0, 10).forEach((ref: any, idx: number) => {
      const rawName = String(ref?.name || "").trim();
      const rawPhone = String(ref?.phone || "").trim();
      if (!rawName || rawName.length < 2) {
        fields.push({ path: `references[${idx}].name`, issue: "required_min_2" });
      }
      const hasPhone = (rawPhone && rawPhone.length >= 5) || normalizePhone(rawName).length >= 7;
      if (!hasPhone) {
        fields.push({ path: `references[${idx}].phone`, issue: "required_min_5" });
      }
    });
  }

  // Documents (selfie + cédula frente/reverso + licencia frente/reverso obligatorios)
  const kinds = new Set<string>();
  documents.forEach((d: any, idx: number) => {
    const kind = d?.kind;
    const url = d?.url;
    const metadata = d?.metadata;
    if (!isNonEmptyString(url) || url.includes("placeholder")) return;

    if (!isNonEmptyString(kind)) fields.push({ path: `documents[${idx}].kind`, issue: "required" });
    else kinds.add(kind.trim());

    if (!url.trim().startsWith("https://")) {
      fields.push({ path: `documents[${idx}].url`, issue: "required_https_url" });
    }

    if (metadata != null) {
      const mime = metadata?.mime;
      const size = metadata?.size;
      const allowedMime = ["image/jpeg", "image/png", "application/pdf"];
      if (mime != null && isNonEmptyString(mime) && !allowedMime.includes(mime.trim())) {
        fields.push({ path: `documents[${idx}].metadata.mime`, issue: "invalid_mime" });
      }
      if (size != null && typeof size === "number" && size > 10 * 1024 * 1024) {
        fields.push({ path: `documents[${idx}].metadata.size`, issue: "max_10mb" });
      }
    }
  });

  for (const reqKind of REQUIRED_DOC_KINDS) {
    if (!kinds.has(reqKind)) {
      fields.push({ path: "documents", issue: `missing_required_${reqKind}` });
    }
  }

  // Referral / Client
  const referralCodeUsed = referral?.referralCodeUsed;
  if (referralCodeUsed != null && isNonEmptyString(referralCodeUsed) && referralCodeUsed.trim().length > 80) {
    fields.push({ path: "referral.referralCodeUsed", issue: "max_80" });
  }
  const requestId = client?.requestId;
  if (requestId != null && isNonEmptyString(requestId) && requestId.trim().length > 80) {
    fields.push({ path: "client.requestId", issue: "max_80" });
  }
  const source = client?.source;
  const allowedSource = ["direct", "referral", "campaign"];
  if (source != null && isNonEmptyString(source) && !allowedSource.includes(source.trim())) {
    fields.push({ path: "client.source", issue: "invalid_source" });
  }

  const email = isNonEmptyString(emailRaw) ? emailRaw.trim().toLowerCase() : "";
  const phoneMobile = isNonEmptyString(phoneMobileRaw) ? normalizePhone(phoneMobileRaw) : "";
  const documentNumber = isNonEmptyString(documentNumberRaw) ? normalizeDoc(documentNumberRaw) : "";
  const familiarFinal =
    isNonEmptyString(familiarWithVehicle) && familiarWithVehicle.trim() === "Otro"
      ? `Otro: ${String(familiarWithVehicleOther || "").trim()}`
      : String(familiarWithVehicle || "").trim();

  let status: "registered" | "pending_review" | "rejected" = "registered";
  let statusReason: string | null = null;
  if (toxicologyTestConsent === false) {
    status = "rejected";
    statusReason = "Toxicology test consent is required.";
  } else if (weeklyDeliveryCommitment === false) {
    status = "rejected";
    statusReason = "Weekly delivery commitment is required.";
  }

  return {
    fields,
    normalized: {
      full_name: isNonEmptyString(fullName) ? fullName.trim() : "",
      document_number: documentNumber,
      date_of_birth: isNonEmptyString(dateOfBirth) ? dateOfBirth.trim() : "",
      phone_mobile: phoneMobile,
      email,
      address: isNonEmptyString(address) ? address.trim() : "",
      has_commercial_exp: hasCommercialExp,
      driving_exp_time: isNonEmptyString(drivingExpTime) ? drivingExpTime.trim() : "",
      similar_job_exp: similarJobExp,
      has_valid_license: true,
      license_number_cat: isNonEmptyString(licenseNumberCat) ? licenseNumberCat.trim() : "",
      familiar_with_vehicle: familiarFinal,
      willing_basic_maintenance: Boolean(willingBasicMaintenance),
      weekly_delivery_commitment: Boolean(weeklyDeliveryCommitment),
      accepts_work_conditions: true,
      understands_damage_liability: true,
      truth_declaration_accepted: true,
      substance_use_last_6_months: Boolean(substanceUseLast6Months),
      substance_details: substanceDetails ? String(substanceDetails).trim() : null,
      toxicology_test_consent: Boolean(toxicologyTestConsent),
      referral_code_used: referralCodeUsed ? String(referralCodeUsed).trim() : null,
      status,
      status_reason: statusReason,
    },
    references,
    documents,
  };
}

function buildRefRows(applicationId: string, references: any[]) {
  return references.slice(0, 10).map((ref: any, idx: number) => {
    let refPhone = normalizePhone(String(ref.phone || ""));
    let refName = String(ref.name || "").trim();
    if (!refPhone || refPhone.length < 7) {
      const digitsFromName = normalizePhone(refName);
      if (digitsFromName && digitsFromName.length >= 7) {
        refPhone = digitsFromName;
        refName = refName.replace(/[\d\s\-+()]{7,}/g, "").trim() || refName;
      }
    }
    return {
      driver_application_id: applicationId,
      position: idx + 1,
      ref_name: refName,
      ref_phone: refPhone || "0000000",
    };
  });
}

function buildDocRows(applicationId: string, documents: any[]) {
  return documents
    .filter((d: any) => isNonEmptyString(d?.url) && d.url.trim().startsWith("https://") && !d.url.includes("placeholder"))
    .slice(0, 20)
    .map((d: any) => ({
      driver_application_id: applicationId,
      kind: String(d.kind).trim(),
      url: String(d.url).trim(),
      metadata: d.metadata ?? {},
    }));
}

/**
 * POST /driver-applications (Público)
 * Crea una nueva postulación
 */
r.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const { fields, normalized, references, documents } = validateAndNormalizeApplication(body);
    if (fields.length > 0) return validationError(res, fields);

    // Anti-duplicados (email/document)
    const existing = await supabase
      .from("driver_applications")
      .select("id")
      .or(`email.eq.${normalized.email},document_number.eq.${normalized.document_number}`)
      .limit(1);

    if (existing.error) {
      return res.status(500).json({ error: existing.error.message });
    }
    if (existing.data && existing.data.length > 0) {
      return res.status(409).json({
        error: "application_already_exists",
        message: "Ya existe una postulación registrada con este correo o número de documento. Usa el enlace que enviamos a tu correo si necesitas modificarla.",
        existingApplicationId: existing.data[0]?.id ?? null,
      });
    }

    const insertApp = await supabase
      .from("driver_applications")
      .insert({
        ...normalized,
        referred_by_driver_id: null,
      })
      .select("id, status, created_at, edit_token")
      .single();

    if (insertApp.error) {
      const msg = insertApp.error.message.toLowerCase();
      if (msg.includes("duplicate key") || msg.includes("unique")) {
        return res.status(409).json({
          error: "application_already_exists",
          message: "Ya existe una postulación registrada con este correo o número de documento.",
        });
      }
      return res.status(500).json({ error: insertApp.error.message });
    }

    const applicationId = insertApp.data.id;
    const editToken = insertApp.data.edit_token;

    const insRefs = await supabase.from("driver_application_references").insert(buildRefRows(applicationId, references));
    if (insRefs.error) {
      return res.status(500).json({ error: insRefs.error.message });
    }

    const docRows = buildDocRows(applicationId, documents);
    if (docRows.length > 0) {
      const insDocs = await supabase.from("driver_application_documents").insert(docRows);
      if (insDocs.error) {
        return res.status(500).json({ error: insDocs.error.message });
      }
    }

    // Enviar correo de confirmación con resumen + link de validación/edición (no bloqueante)
    void sendApplicantConfirmationEmail({
      to: normalized.email,
      fullName: normalized.full_name,
      documentNumber: normalized.document_number,
      phoneMobile: normalized.phone_mobile,
      address: normalized.address,
      dateOfBirth: normalized.date_of_birth,
      licenseNumberCat: normalized.license_number_cat,
      drivingExpTime: normalized.driving_exp_time,
      editToken,
    });

    return res.status(201).json({
      id: applicationId,
      status: insertApp.data.status,
      createdAt: insertApp.data.created_at,
      editToken,
      editUrl: buildEditUrl(editToken),
      message: "Application received. We will contact you soon.",
    });
  } catch (e: any) {
    return res.status(500).json({
      error: "internal_error",
      message: e?.message ?? "Unexpected error",
    });
  }
});

/**
 * GET /driver-applications/by-token/:token (Público)
 * Obtiene los datos de la postulación para que el candidato valide o corrija sus datos.
 */
r.get("/by-token/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token || "").trim();
  if (!UUID_RE.test(token)) {
    return res.status(400).json({ error: "invalid_token", message: "Enlace de edición inválido." });
  }

  const { data, error } = await supabase
    .from("driver_applications")
    .select("*, driver_application_references(*), driver_application_documents(*)")
    .eq("edit_token", token)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "not_found", message: "No encontramos una postulación asociada a este enlace." });
  }

  return res.json({
    application: data,
    editable: EDITABLE_STATUSES.has(String(data.status || "")),
  });
});

/**
 * PUT /driver-applications/by-token/:token (Público)
 * Permite al postulante corregir sus datos y documentos mientras esté en registered o pending_review.
 */
r.put("/by-token/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!UUID_RE.test(token)) {
      return res.status(400).json({ error: "invalid_token", message: "Enlace de edición inválido." });
    }

    const { data: existingApp, error: findErr } = await supabase
      .from("driver_applications")
      .select("id, status, edit_token")
      .eq("edit_token", token)
      .single();

    if (findErr || !existingApp) {
      return res.status(404).json({ error: "not_found", message: "No encontramos una postulación asociada a este enlace." });
    }

    if (!EDITABLE_STATUSES.has(String(existingApp.status || ""))) {
      return res.status(403).json({
        error: "application_locked",
        message: "Esta postulación ya fue procesada (aprobada o rechazada) y no puede modificarse.",
      });
    }

    const body = req.body ?? {};
    const { fields, normalized, references, documents } = validateAndNormalizeApplication(body);
    if (fields.length > 0) return validationError(res, fields);

    // Verificar duplicados en OTRAS postulaciones
    const dup = await supabase
      .from("driver_applications")
      .select("id")
      .neq("id", existingApp.id)
      .or(`email.eq.${normalized.email},document_number.eq.${normalized.document_number}`)
      .limit(1);

    if (dup.error) {
      return res.status(500).json({ error: dup.error.message });
    }
    if (dup.data && dup.data.length > 0) {
      return res.status(409).json({
        error: "application_already_exists",
        message: "El correo o documento ya pertenece a otra postulación.",
      });
    }

    const { status: _ignoredStatus, status_reason: _ignoredReason, ...updatable } = normalized;
    const { error: updErr } = await supabase
      .from("driver_applications")
      .update({
        ...updatable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingApp.id);

    if (updErr) {
      return res.status(500).json({ error: updErr.message });
    }

    await supabase.from("driver_application_references").delete().eq("driver_application_id", existingApp.id);
    const insRefs = await supabase.from("driver_application_references").insert(buildRefRows(existingApp.id, references));
    if (insRefs.error) {
      return res.status(500).json({ error: insRefs.error.message });
    }

    const docRows = buildDocRows(existingApp.id, documents);
    await supabase.from("driver_application_documents").delete().eq("driver_application_id", existingApp.id);
    if (docRows.length > 0) {
      const insDocs = await supabase.from("driver_application_documents").insert(docRows);
      if (insDocs.error) {
        return res.status(500).json({ error: insDocs.error.message });
      }
    }

    void sendApplicantConfirmationEmail({
      to: normalized.email,
      fullName: normalized.full_name,
      documentNumber: normalized.document_number,
      phoneMobile: normalized.phone_mobile,
      address: normalized.address,
      dateOfBirth: normalized.date_of_birth,
      licenseNumberCat: normalized.license_number_cat,
      drivingExpTime: normalized.driving_exp_time,
      editToken: existingApp.edit_token,
      isUpdate: true,
    });

    return res.json({
      ok: true,
      id: existingApp.id,
      status: existingApp.status,
      editUrl: buildEditUrl(existingApp.edit_token),
    });
  } catch (e: any) {
    return res.status(500).json({
      error: "internal_error",
      message: e?.message ?? "Unexpected error",
    });
  }
});

// ============================================
// ADMIN ROUTES (Protected via Basic Auth)
// ============================================

// GET /driver-applications (Admin List)
r.get("/", basicAuth, async (req: Request, res: Response) => {

  // 2. Query Params
  const { status, limit = "50" } = req.query;

  // 3. Build Query
  let q = supabase
    .from("driver_applications")
    .select("*, driver_application_references(*), driver_application_documents(*)") // Traemos relaciones
    .order("created_at", { ascending: false })
    .limit(Number(limit));

  if (status) {
    q = q.eq("status", status);
  }

  // 4. Execute
  const { data, error } = await q;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data);
});

// PATCH /driver-applications/:id (Admin Update Status & Editable Fields)
r.patch("/:id", basicAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body ?? {};
  const {
    status,
    status_reason,
    full_name,
    document_number,
    date_of_birth,
    phone_mobile,
    email,
    address,
    license_number_cat,
    has_valid_license,
    driving_exp_time,
    has_commercial_exp,
    similar_job_exp,
    familiar_with_vehicle,
    references,
  } = body;

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (status !== undefined) {
    if (!isNonEmptyString(status)) {
      return res.status(400).json({ error: "status cannot be empty" });
    }
    if (status === "rejected" && (!status_reason || !String(status_reason).trim())) {
      return res.status(400).json({ error: "El motivo del rechazo (status_reason) es obligatorio." });
    }
    updates.status = status;
  }

  if (status_reason !== undefined) updates.status_reason = status_reason;
  if (full_name !== undefined) {
    if (!isNonEmptyString(full_name) || full_name.trim().length < 5) {
      return res.status(400).json({ error: "El nombre completo debe tener al menos 5 caracteres." });
    }
    updates.full_name = full_name.trim();
  }
  if (document_number !== undefined) {
    if (!isNonEmptyString(document_number) || document_number.trim().length < 5) {
      return res.status(400).json({ error: "El número de documento debe tener al menos 5 caracteres." });
    }
    updates.document_number = normalizeDoc(document_number);
  }
  if (date_of_birth !== undefined) {
    if (!isISODate(date_of_birth)) {
      return res.status(400).json({ error: "Fecha de nacimiento inválida (YYYY-MM-DD)." });
    }
    updates.date_of_birth = date_of_birth.trim();
  }
  if (phone_mobile !== undefined) {
    const normalized = normalizePhone(String(phone_mobile));
    if (normalized.length < 7) {
      return res.status(400).json({ error: "El celular debe tener al menos 7 dígitos." });
    }
    updates.phone_mobile = normalized;
  }
  if (email !== undefined) {
    if (!isEmail(email)) {
      return res.status(400).json({ error: "Correo electrónico inválido." });
    }
    updates.email = email.trim().toLowerCase();
  }
  if (address !== undefined) {
    if (!isNonEmptyString(address) || address.trim().length < 5) {
      return res.status(400).json({ error: "La dirección debe tener al menos 5 caracteres." });
    }
    updates.address = address.trim();
  }
  if (license_number_cat !== undefined) {
    updates.license_number_cat = license_number_cat ? String(license_number_cat).trim() : null;
  }
  if (has_valid_license !== undefined) updates.has_valid_license = Boolean(has_valid_license);
  if (driving_exp_time !== undefined) updates.driving_exp_time = String(driving_exp_time).trim();
  if (has_commercial_exp !== undefined) updates.has_commercial_exp = Boolean(has_commercial_exp);
  if (similar_job_exp !== undefined) updates.similar_job_exp = String(similar_job_exp).trim();
  if (familiar_with_vehicle !== undefined) updates.familiar_with_vehicle = String(familiar_with_vehicle).trim();

  if (Object.keys(updates).length === 1 && !Array.isArray(references)) {
    return res.status(400).json({ error: "No se enviaron campos para actualizar." });
  }

  const { error } = await supabase
    .from("driver_applications")
    .update(updates)
    .eq("id", id);

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("duplicate key") || msg.includes("unique")) {
      return res.status(409).json({ error: "Ya existe otra postulación con ese correo o documento." });
    }
    return res.status(500).json({ error: error.message });
  }

  if (Array.isArray(references)) {
    await supabase.from("driver_application_references").delete().eq("driver_application_id", String(id));
    const refRows = buildRefRows(String(id), references).filter(r => r.ref_name.length >= 2);
    if (refRows.length > 0) {
      const insRefs = await supabase.from("driver_application_references").insert(refRows);
      if (insRefs.error) return res.status(500).json({ error: insRefs.error.message });
    }
  }

  const { data: updated, error: fetchErr } = await supabase
    .from("driver_applications")
    .select("*, driver_application_references(*), driver_application_documents(*)")
    .eq("id", id)
    .single();

  if (fetchErr) {
    return res.json({ ok: true });
  }

  return res.json({ ok: true, application: updated });
});

// POST /driver-applications/:id/documents (Admin attach / update document)
r.post("/:id/documents", basicAuth, async (req: Request, res: Response) => {

  const { id } = req.params;
  const { kind, url, metadata } = req.body;

  if (!kind || !url) {
    return res.status(400).json({ error: "kind and url are required" });
  }

  // Delete existing document of this kind for this application if any
  await supabase
    .from("driver_application_documents")
    .delete()
    .eq("driver_application_id", id)
    .eq("kind", kind);

  const { data, error } = await supabase
    .from("driver_application_documents")
    .insert([{
      driver_application_id: Number(id),
      kind,
      url,
      metadata: metadata || {}
    }])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, document: data });
});

export default r;