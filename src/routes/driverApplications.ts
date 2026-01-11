// src/routes/driverApplications.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

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
  return res.status(422).json({
    error: "validation_error",
    message: "Invalid payload.",
    fields,
  });
}

/**
 * POST /driver-applications (Público)
 * Crea una nueva postulación
 */
r.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    const fields: FieldIssue[] = [];

    // -----------------------------
    // Extract
    // -----------------------------
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

    // -----------------------------
    // Validate: Personal
    // -----------------------------
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

    // -----------------------------
    // Validate: Work
    // -----------------------------
    const hasCommercialExp = workExperience.hasCommercialExp;
    if (typeof hasCommercialExp !== "boolean") {
      fields.push({ path: "workExperience.hasCommercialExp", issue: "required_boolean" });
    }

    const drivingExpTime = workExperience.drivingExpTime;
    if (!isNonEmptyString(drivingExpTime) || drivingExpTime.trim().length < 2 || drivingExpTime.trim().length > 80) {
      fields.push({ path: "workExperience.drivingExpTime", issue: "required_min_2_max_80" });
    }

    const similarJobExp = workExperience.similarJobExp;
    if (!isNonEmptyString(similarJobExp) || similarJobExp.trim().length < 3 || similarJobExp.trim().length > 800) {
      fields.push({ path: "workExperience.similarJobExp", issue: "required_min_3_max_800" });
    }

    // -----------------------------
    // Validate: License
    // -----------------------------
    const hasValidLicense = license.hasValidLicense;
    if (typeof hasValidLicense !== "boolean") {
      fields.push({ path: "license.hasValidLicense", issue: "required_boolean" });
    }

    const licenseNumberCat = license.licenseNumberCat;
    if (hasValidLicense === true) {
      if (!isNonEmptyString(licenseNumberCat) || licenseNumberCat.trim().length < 2 || licenseNumberCat.trim().length > 80) {
        fields.push({ path: "license.licenseNumberCat", issue: "required_when_hasValidLicense_true" });
      }
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
    } else {
      // Si no es "Otro", debería venir null/undefined
      if (familiarWithVehicleOther != null && String(familiarWithVehicleOther).trim() !== "") {
        fields.push({ path: "license.familiarWithVehicleOther", issue: "must_be_null_unless_Otro" });
      }
    }

    // -----------------------------
    // Validate: Responsibilities
    // -----------------------------
    const willingBasicMaintenance = responsibilities.willingBasicMaintenance;
    if (typeof willingBasicMaintenance !== "boolean") {
      fields.push({ path: "responsibilities.willingBasicMaintenance", issue: "required_boolean" });
    }

    const weeklyDeliveryCommitment = responsibilities.weeklyDeliveryCommitment;
    if (typeof weeklyDeliveryCommitment !== "boolean") {
      fields.push({ path: "responsibilities.weeklyDeliveryCommitment", issue: "required_boolean" });
    }

    // -----------------------------
    // Validate: Substances
    // -----------------------------
    const substanceUseLast6Months = substances.substanceUseLast6Months;
    if (typeof substanceUseLast6Months !== "boolean") {
      fields.push({ path: "substances.substanceUseLast6Months", issue: "required_boolean" });
    }

    const substanceDetails = substances.substanceDetails;
    if (substanceUseLast6Months === true) {
      // opcional, pero si viene, validamos tamaño
      if (substanceDetails != null && isNonEmptyString(substanceDetails) && substanceDetails.trim().length > 800) {
        fields.push({ path: "substances.substanceDetails", issue: "max_800" });
      }
    } else {
      // si no consumió, debería ser null/empty
      // no es crítico, lo podemos ignorar o normalizar
    }

    const toxicologyTestConsent = substances.toxicologyTestConsent;
    if (typeof toxicologyTestConsent !== "boolean") {
      fields.push({ path: "substances.toxicologyTestConsent", issue: "required_boolean" });
    }

    // -----------------------------
    // Validate: Confirmations (todas true)
    // -----------------------------
    const acceptsWorkConditions = confirmations.acceptsWorkConditions;
    const understandsDamageLiability = confirmations.understandsDamageLiability;
    const truthDeclarationAccepted = confirmations.truthDeclarationAccepted;

    if (acceptsWorkConditions !== true) fields.push({ path: "confirmations.acceptsWorkConditions", issue: "must_be_true" });
    if (understandsDamageLiability !== true) fields.push({ path: "confirmations.understandsDamageLiability", issue: "must_be_true" });
    if (truthDeclarationAccepted !== true) fields.push({ path: "confirmations.truthDeclarationAccepted", issue: "must_be_true" });

    // -----------------------------
    // Validate: References (2 mínimo)
    // -----------------------------
    if (!Array.isArray(references) || references.length < 2) {
      fields.push({ path: "references", issue: "min_2_required" });
    } else {
      references.slice(0, 10).forEach((ref: any, idx: number) => {
        if (!isNonEmptyString(ref?.name) || ref.name.trim().length < 3) {
          fields.push({ path: `references[${idx}].name`, issue: "required_min_3" });
        }
        if (!isNonEmptyString(ref?.phone) || String(ref.phone).trim().length < 7) {
          fields.push({ path: `references[${idx}].phone`, issue: "required_min_7" });
        }
      });
    }

    // -----------------------------
    // Validate: Documents (requeridos)
    // -----------------------------
    const kinds = new Set<string>();
    documents.forEach((d: any, idx: number) => {
      const kind = d?.kind;
      const url = d?.url;
      const metadata = d?.metadata;

      if (!isNonEmptyString(kind)) fields.push({ path: `documents[${idx}].kind`, issue: "required" });
      else kinds.add(kind.trim());

      if (!isNonEmptyString(url) || !url.trim().startsWith("https://")) {
        fields.push({ path: `documents[${idx}].url`, issue: "required_https_url" });
      }

      // metadata opcional, pero si viene, valida size/mime
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

    // Requeridos por negocio
    if (!kinds.has("id_document_photo")) {
      fields.push({ path: "documents", issue: "missing_id_document_photo" });
    }
    if (hasValidLicense === true && !kinds.has("driver_license_photo")) {
      fields.push({ path: "documents", issue: "missing_driver_license_photo" });
    }
    if (!kinds.has("digital_signature")) {
      fields.push({ path: "documents", issue: "missing_digital_signature" });
    }

    // -----------------------------
    // Validate: Referral / Client
    // -----------------------------
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

    // Si hay errores, corta.
    if (fields.length > 0) return validationError(res, fields);

    // -----------------------------
    // Normalización
    // -----------------------------
    const email = String(emailRaw).trim().toLowerCase();
    const phoneMobile = normalizePhone(String(phoneMobileRaw));
    const documentNumber = normalizeDoc(String(documentNumberRaw));

    const familiarFinal =
      String(familiarWithVehicle).trim() === "Otro"
        ? `Otro: ${String(familiarWithVehicleOther).trim()}`
        : String(familiarWithVehicle).trim();

    // -----------------------------
    // Reglas de negocio -> status
    // -----------------------------
    let status: "registered" | "pending_review" | "rejected" = "registered";
    let statusReason: string | null = null;

    if (toxicologyTestConsent === false) {
      status = "rejected";
      statusReason = "Toxicology test consent is required.";
    } else if (weeklyDeliveryCommitment === false) {
      status = "rejected";
      statusReason = "Weekly delivery commitment is required.";
    } else if (hasValidLicense === false) {
      status = "pending_review";
      statusReason = "No valid license declared.";
    }

    // -----------------------------
    // Anti-duplicados (email/document)
    // -----------------------------
    const existing = await supabase
      .from("driver_applications")
      .select("id", { count: "exact", head: false })
      .or(`email.eq.${email},document_number.eq.${documentNumber}`)
      .limit(1);

    if (existing.error) {
      return res.status(500).json({ error: existing.error.message });
    }
    if (existing.data && existing.data.length > 0) {
      const existingApplicationId = existing.data[0]?.id ?? null;
      return res.status(409).json({
        error: "application_already_exists",
        message: "An application already exists for this email or document.",
        existingApplicationId,
      });
    }

    // -----------------------------
    // Insert: driver_applications
    // -----------------------------
    const insertApp = await supabase
      .from("driver_applications")
      .insert({
        full_name: String(fullName).trim(),
        document_number: documentNumber,
        date_of_birth: String(dateOfBirth).trim(),
        phone_mobile: phoneMobile,
        email,
        address: String(address).trim(),

        has_commercial_exp: hasCommercialExp,
        driving_exp_time: String(drivingExpTime).trim(),
        similar_job_exp: String(similarJobExp).trim(),

        has_valid_license: hasValidLicense,
        license_number_cat: hasValidLicense ? String(licenseNumberCat).trim() : null,
        familiar_with_vehicle: familiarFinal,

        willing_basic_maintenance: willingBasicMaintenance,
        weekly_delivery_commitment: weeklyDeliveryCommitment,

        accepts_work_conditions: true,
        understands_damage_liability: true,
        truth_declaration_accepted: true,

        substance_use_last_6_months: substanceUseLast6Months,
        substance_details: substanceDetails ? String(substanceDetails).trim() : null,
        toxicology_test_consent: toxicologyTestConsent,

        referral_code_used: referralCodeUsed ? String(referralCodeUsed).trim() : null,
        referred_by_driver_id: null, // opcional: resolverlo si implementas referral_links

        status,
        status_reason: statusReason,
      })
      .select("id, status, created_at")
      .single();

    if (insertApp.error) {
      // Si por carrera se insertó repetido por unique constraint
      const msg = insertApp.error.message.toLowerCase();
      if (msg.includes("duplicate key") || msg.includes("unique")) {
        return res.status(409).json({
          error: "application_already_exists",
          message: "An application already exists for this email or document.",
        });
      }
      return res.status(500).json({ error: insertApp.error.message });
    }

    const applicationId = insertApp.data.id;

    // -----------------------------
    // Insert: references
    // -----------------------------
    const refRows = references.slice(0, 10).map((ref: any, idx: number) => ({
      driver_application_id: applicationId,
      position: idx + 1,
      ref_name: String(ref.name).trim(),
      ref_phone: normalizePhone(String(ref.phone)),
    }));

    const insRefs = await supabase.from("driver_application_references").insert(refRows);
    if (insRefs.error) {
      return res.status(500).json({ error: insRefs.error.message });
    }

    // -----------------------------
    // Insert: documents
    // -----------------------------
    const docRows = documents.slice(0, 20).map((d: any) => ({
      driver_application_id: applicationId,
      kind: String(d.kind).trim(),
      url: String(d.url).trim(),
      metadata: d.metadata ?? {},
    }));

    const insDocs = await supabase.from("driver_application_documents").insert(docRows);
    if (insDocs.error) {
      return res.status(500).json({ error: insDocs.error.message });
    }

    // -----------------------------
    // Response
    // -----------------------------
    return res.status(201).json({
      id: applicationId,
      status: insertApp.data.status,
      createdAt: insertApp.data.created_at,
      message: "Application received. We will contact you soon.",
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
r.get("/", async (req: Request, res: Response) => {
  // 1. Basic Auth Check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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

// PATCH /driver-applications/:id (Admin Update Status)
r.patch("/:id", async (req: Request, res: Response) => {
  // 1. Basic Auth Check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.params;
  const { status, status_reason } = req.body;

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  // 2. Update
  const { error } = await supabase
    .from("driver_applications")
    .update({ 
      status, 
      status_reason, 
      updated_at: new Date().toISOString() 
    })
    .eq("id", id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true });
});

export default r;