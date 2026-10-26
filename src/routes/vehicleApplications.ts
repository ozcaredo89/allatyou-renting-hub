// src/routes/vehicleApplications.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { basicAuth } from "../middleware/basicAuth";

const r = Router();

/**
 * Helpers de validación (Reutilizados para mantener uniformidad)
 */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isEmail(v: unknown): v is string {
  if (!isNonEmptyString(v)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// YYYY-MM-DD
function isISODate(v: unknown): v is string {
  if (!isNonEmptyString(v)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return false;
  const d = new Date(v.trim() + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

function normalizeColombianPhone(v: string): string {
  let digits = v.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("57")) {
    digits = digits.slice(2);
  }
  return digits;
}

function normalizePlate(v: string): string {
  // Mayúsculas y solo alfanuméricos
  return v.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Detecta cadenas aleatorias generadas por bots (ej: "ywHraBYLhrnSzmhmzFb GyEGEuhoXgywAorfx")
 * sin bloquear apellidos reales cortos con mayúsculas internas (ej: McDonald, DiCaprio).
 */
function isGibberishText(v: string): boolean {
  const clean = v.trim();
  if (!clean) return false;

  const words = clean.split(/\s+/);
  for (const word of words) {
    // Palabra excesivamente larga sin espacios
    if (word.length > 25) return true;

    // 6 o más consonantes seguidas (imposible en nombres/marcas/líneas reales)
    if (/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]{6,}/.test(word)) {
      return true;
    }

    // Alternancia caótica de mayúsculas y minúsculas solo en palabras de 10 letras o más
    if (word.length >= 10 && word !== word.toUpperCase()) {
      let caseTransitions = 0;
      for (let i = 1; i < word.length; i++) {
        const prevChar = word.charAt(i - 1);
        const currChar = word.charAt(i);
        const prevIsUpper = /[A-ZÁÉÍÓÚÑ]/.test(prevChar);
        const currIsUpper = /[A-ZÁÉÍÓÚÑ]/.test(currChar);
        const prevIsLetter = /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(prevChar);
        const currIsLetter = /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(currChar);
        if (prevIsLetter && currIsLetter && prevIsUpper !== currIsUpper) {
          caseTransitions++;
        }
      }
      if (caseTransitions >= 3) return true;
    }
  }

  return false;
}

type FieldIssue = { path: string; issue: string; label?: string };

const FIELD_LABELS: Record<string, string> = {
  "owner.fullName": "Nombre completo del propietario",
  "owner.phone": "Celular / WhatsApp válido (10 dígitos)",
  "owner.email": "Correo electrónico válido",
  "owner.city": "Ciudad",
  "vehicle.plate": "Placa válida (formato ABC123: 3 letras y 3 números)",
  "vehicle.brand": "Marca del vehículo",
  "vehicle.line": "Línea del vehículo (ej: Picanto, Civic, Onix)",
  "vehicle.year": "Año/Modelo válido",
  "vehicle.color": "Color del vehículo",
  "vehicle.fuel": "Tipo de combustible",
  "business.appointmentDate": "Disponibilidad para ver el vehículo (Paso 3)",
  "business.availability": "Modalidad de disponibilidad",
  "business.expectedPrice": "Precio diario esperado",
  "status.mileage": "Kilometraje válido",
  "status.soatDate": "Fecha de vencimiento del SOAT",
  "status.technoDate": "Fecha de vencimiento de Tecnomecánica",
  "status.hasInsurance": "Confirmación de Seguro Todo Riesgo",
};

function validationError(res: Response, fields: FieldIssue[]) {
  const friendlyList = fields
    .map(f => f.label || FIELD_LABELS[f.path] || f.path)
    .join(", ");
  return res.status(422).json({
    error: "validation_error",
    message: `Por favor completa o corrige: ${friendlyList}.`,
    fields,
  });
}

/**
 * POST /vehicle-applications (Público)
 * Registro de nuevos vehículos
 */
r.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const fields: FieldIssue[] = [];

    // Honeypot anti-bots
    if (isNonEmptyString(body.website)) {
      return res.status(400).json({
        error: "spam_detected",
        message: "Solicitud bloqueada por filtro automático anti-spam.",
      });
    }

    // -----------------------------
    // Extract
    // -----------------------------
    const owner = body.owner ?? {};
    const vehicle = body.vehicle ?? {};
    const business = body.business ?? {};
    const statusData = body.status ?? {};
    const photos = Array.isArray(body.photos) ? body.photos : [];

    // -----------------------------
    // Validate: Owner (Propietario)
    // -----------------------------
    const ownerName = owner.fullName;
    if (!isNonEmptyString(ownerName) || ownerName.trim().length < 3 || ownerName.trim().length > 120) {
      fields.push({ path: "owner.fullName", issue: "required_min_3_max_120" });
    } else if (isGibberishText(ownerName)) {
      fields.push({
        path: "owner.fullName",
        issue: "invalid_text",
        label: "Revisa el nombre, parece tener un error de escritura",
      });
    }

    const ownerPhoneRaw = owner.phone;
    let ownerPhoneClean = "";
    if (!isNonEmptyString(ownerPhoneRaw)) {
      fields.push({ path: "owner.phone", issue: "required" });
    } else {
      ownerPhoneClean = normalizeColombianPhone(ownerPhoneRaw);
      if (!/^3\d{9}$/.test(ownerPhoneClean)) {
        fields.push({
          path: "owner.phone",
          issue: "invalid_phone",
          label: "Celular de 10 dígitos (ej: 3001234567)",
        });
      }
    }

    const ownerEmailRaw = owner.email;
    if (!isEmail(ownerEmailRaw) || ownerEmailRaw.trim().length > 180) {
      fields.push({ path: "owner.email", issue: "invalid_email_or_too_long" });
    }

    const ownerCity = owner.city;
    if (!isNonEmptyString(ownerCity)) {
      fields.push({ path: "owner.city", issue: "required" });
    }

    // -----------------------------
    // Validate: Vehicle (Activo)
    // -----------------------------
    const plateRaw = vehicle.plate;
    let plateNormalized = "";
    if (!isNonEmptyString(plateRaw)) {
      fields.push({ path: "vehicle.plate", issue: "required" });
    } else {
      plateNormalized = normalizePlate(plateRaw);
      if (!/^[A-Z]{3}\d{3}$/.test(plateNormalized)) {
        fields.push({
          path: "vehicle.plate",
          issue: "invalid_plate_format",
          label: "Placa colombiana válida (3 letras y 3 números, ej: ABC123)",
        });
      }
    }

    const brand = vehicle.brand;
    if (!isNonEmptyString(brand) || brand === "Otra") {
      fields.push({ path: "vehicle.brand", issue: "required" });
    } else if (isGibberishText(brand) || brand.trim().length > 40) {
      fields.push({ path: "vehicle.brand", issue: "invalid_brand", label: "Marca de vehículo válida" });
    }

    const line = vehicle.line;
    if (!isNonEmptyString(line)) {
      fields.push({ path: "vehicle.line", issue: "required" });
    } else if (isGibberishText(line) || line.trim().length > 50) {
      fields.push({
        path: "vehicle.line",
        issue: "invalid_line",
        label: "Línea del vehículo válida (ej: Picanto, Civic, Onix)",
      });
    }

    const year = Number(vehicle.year);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1990 || year > currentYear + 1) {
      fields.push({ path: "vehicle.year", issue: "invalid_year" });
    }

    const color = vehicle.color;
    if (!isNonEmptyString(color)) {
      fields.push({ path: "vehicle.color", issue: "required" });
    } else if (isGibberishText(color) || color.trim().length > 35) {
      fields.push({ path: "vehicle.color", issue: "invalid_color", label: "Color del vehículo válido" });
    }

    const fuel = vehicle.fuel;
    const allowedFuel = ["Gasolina", "Gas/Gasolina", "Diesel", "Eléctrico", "Híbrido"];
    if (!isNonEmptyString(fuel) || !allowedFuel.includes(fuel)) {
      fields.push({ path: "vehicle.fuel", issue: "invalid_fuel_type" });
    }

    // -----------------------------
    // Validate: Business (Negocio)
    // -----------------------------
    const appointmentDate = business.appointmentDate;
    if (!isNonEmptyString(appointmentDate)) {
      fields.push({ path: "business.appointmentDate", issue: "required" });
    } else if (isGibberishText(appointmentDate)) {
      fields.push({ path: "business.appointmentDate", issue: "invalid_text" });
    }

    const availability = business.availability;
    if (!isNonEmptyString(availability)) {
      fields.push({ path: "business.availability", issue: "required" });
    }

    const expectedPrice = Number(business.expectedPrice);
    if (Number.isNaN(expectedPrice) || expectedPrice <= 0) {
      fields.push({ path: "business.expectedPrice", issue: "required_positive_number" });
    }

    // -----------------------------
    // Validate: Status & Docs (Opcionales algunos)
    // -----------------------------
    const mileage = statusData.mileage;
    if (mileage !== undefined && mileage !== null && mileage !== "") {
      const parsedMileage = Number(mileage);
      if (Number.isNaN(parsedMileage) || parsedMileage < 0) {
        fields.push({ path: "status.mileage", issue: "must_be_positive_number" });
      }
    }

    const soatDate = statusData.soatDate;
    if (soatDate && !isISODate(soatDate)) {
      fields.push({ path: "status.soatDate", issue: "invalid_iso_date" });
    }

    const technoDate = statusData.technoDate;
    if (technoDate && !isISODate(technoDate)) {
      fields.push({ path: "status.technoDate", issue: "invalid_iso_date" });
    }

    const hasInsurance = statusData.hasInsurance;
    if (typeof hasInsurance !== "boolean") {
      fields.push({ path: "status.hasInsurance", issue: "required_boolean" });
    }

    // -----------------------------
    // Validate: Photos (Solo URLs de nuestro bucket R2)
    // -----------------------------
    const allowedBucketPrefix = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
    photos.forEach((p: any, idx: number) => {
      const urlStr = isNonEmptyString(p.url) ? p.url.trim() : "";
      const isAllowedOrigin = allowedBucketPrefix
        ? urlStr.startsWith(`${allowedBucketPrefix}/`)
        : urlStr.startsWith("https://");
      if (!urlStr || !isAllowedOrigin) {
        fields.push({ path: `photos[${idx}].url`, issue: "invalid_url", label: `Foto #${idx + 1} válida` });
      }
      if (!isNonEmptyString(p.kind)) {
        fields.push({ path: `photos[${idx}].kind`, issue: "required_kind", label: `Tipo de foto #${idx + 1}` });
      }
    });

    // Si hay errores, cortar
    if (fields.length > 0) return validationError(res, fields);

    // -----------------------------
    // Normalización Final
    // -----------------------------
    const ownerEmail = String(ownerEmailRaw).trim().toLowerCase();

    // -----------------------------
    // Anti-duplicados (Por Placa)
    // -----------------------------
    const existing = await supabase
      .from("vehicle_applications")
      .select("id")
      .eq("plate", plateNormalized)
      .limit(1);

    if (existing.error) {
      return res.status(500).json({ error: existing.error.message });
    }

    if (existing.data && existing.data.length > 0) {
      return res.status(409).json({
        error: "vehicle_already_exists",
        message: `El vehículo con placa ${plateNormalized} ya se encuentra registrado en nuestro sistema.`,
      });
    }

    // -----------------------------
    // Insert: vehicle_applications
    // -----------------------------
    const insertData = {
      owner_name: String(ownerName).trim(),
      owner_phone: ownerPhoneClean,
      owner_email: ownerEmail,
      owner_city: String(ownerCity).trim(),

      plate: plateNormalized,
      brand: String(brand).trim(),
      line: String(line).trim(),
      model_year: year,
      color: String(color).trim(),
      fuel_type: String(fuel).trim(),

      is_brand_suggestion: !!vehicle.isBrandNewSuggestion,
      is_line_suggestion: !!vehicle.isLineNewSuggestion,

      appointment_date: String(appointmentDate).trim(),
      availability_type: String(availability).trim(),
      expected_daily_rent: expectedPrice,

      mileage: mileage ? Number(mileage) : null,
      soat_expires_at: soatDate || null,
      techno_expires_at: technoDate || null,
      has_all_risk_insurance: hasInsurance,

      photos: photos,

      status: "pending",
      status_reason: null,
    };

    const { data, error } = await supabase
      .from("vehicle_applications")
      .insert(insertData)
      .select("id, created_at")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({
      id: data.id,
      createdAt: data.created_at,
      message: "Vehículo registrado exitosamente.",
    });
  } catch (e: any) {
    return res.status(500).json({
      error: "internal_error",
      message: e?.message ?? "Error inesperado en el servidor",
    });
  }
});

// ============================================
// ADMIN ROUTES (Protected via Basic Auth)
// ============================================

// GET /vehicle-applications (Admin List)
r.get("/", basicAuth, async (req: Request, res: Response) => {
  const { status, limit = "50" } = req.query;

  let q = supabase
    .from("vehicle_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Number(limit));

  if (status) {
    q = q.eq("status", status);
  }

  const { data, error } = await q;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data);
});

// PATCH /vehicle-applications/:id (Admin Update Status)
r.patch("/:id", basicAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, status_reason } = req.body;

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  if (status === "rejected" && (!status_reason || !String(status_reason).trim())) {
    return res.status(400).json({ error: "El motivo del rechazo (status_reason) es obligatorio." });
  }

  const { error } = await supabase
    .from("vehicle_applications")
    .update({
      status,
      status_reason,
    })
    .eq("id", id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true });
});

export default r;
