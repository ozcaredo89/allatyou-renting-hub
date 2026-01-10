// src/routes/vehicleApplications.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

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

function normalizePhone(v: string): string {
  // Conserva + y números. Quita espacios y guiones.
  return v.replace(/[^\d+]/g, "");
}

function normalizePlate(v: string): string {
  // Mayúsculas y solo alfanuméricos
  return v.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
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
 * POST /vehicle-applications
 */
r.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const fields: FieldIssue[] = [];

    // -----------------------------
    // Extract
    // -----------------------------
    const owner = body.owner ?? {};
    const vehicle = body.vehicle ?? {};
    const business = body.business ?? {};
    const statusData = body.status ?? {}; // 'status' es palabra reservada en algunos contextos, usamos statusData
    const photos = Array.isArray(body.photos) ? body.photos : [];

    // -----------------------------
    // Validate: Owner (Propietario)
    // -----------------------------
    const ownerName = owner.fullName;
    if (!isNonEmptyString(ownerName) || ownerName.trim().length < 3 || ownerName.trim().length > 120) {
      fields.push({ path: "owner.fullName", issue: "required_min_3_max_120" });
    }

    const ownerPhoneRaw = owner.phone;
    if (!isNonEmptyString(ownerPhoneRaw) || ownerPhoneRaw.trim().length < 7 || ownerPhoneRaw.trim().length > 20) {
      fields.push({ path: "owner.phone", issue: "required_min_7_max_20" });
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
      if (plateNormalized.length !== 6) {
        fields.push({ path: "vehicle.plate", issue: "must_be_6_chars" });
      }
    }

    const brand = vehicle.brand;
    if (!isNonEmptyString(brand)) fields.push({ path: "vehicle.brand", issue: "required" });

    const line = vehicle.line;
    if (!isNonEmptyString(line)) fields.push({ path: "vehicle.line", issue: "required" });

    const year = vehicle.year;
    const currentYear = new Date().getFullYear();
    if (typeof year !== "number" || year < 1990 || year > currentYear + 1) {
      fields.push({ path: "vehicle.year", issue: "invalid_year" });
    }

    const color = vehicle.color;
    if (!isNonEmptyString(color)) fields.push({ path: "vehicle.color", issue: "required" });

    const fuel = vehicle.fuel;
    const allowedFuel = ["Gasolina", "Gas/Gasolina", "Diesel", "Eléctrico"];
    if (!isNonEmptyString(fuel) || !allowedFuel.includes(fuel)) {
      fields.push({ path: "vehicle.fuel", issue: "invalid_fuel_type" });
    }

    // -----------------------------
    // Validate: Business (Negocio)
    // -----------------------------
    const appointmentDate = business.appointmentDate;
    if (!isNonEmptyString(appointmentDate)) {
      fields.push({ path: "business.appointmentDate", issue: "required" });
    }

    const availability = business.availability;
    const allowedAvail = ["hours", "days", "unlimited"]; // Ajustar según lo que envíe el front
    if (!isNonEmptyString(availability)) { // || !allowedAvail.includes(availability) -> opcional validar estricto
       fields.push({ path: "business.availability", issue: "required" });
    }

    const expectedPrice = business.expectedPrice;
    if (typeof expectedPrice !== "number" || expectedPrice < 0) {
      fields.push({ path: "business.expectedPrice", issue: "required_positive_number" });
    }

    // -----------------------------
    // Validate: Status & Docs (Opcionales algunos)
    // -----------------------------
    const mileage = statusData.mileage;
    if (mileage !== undefined && (typeof mileage !== "number" || mileage < 0)) {
      fields.push({ path: "status.mileage", issue: "must_be_positive_number" });
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
    // Validate: Photos
    // -----------------------------
    // Solo validamos estructura básica si vienen
    photos.forEach((p: any, idx: number) => {
        if (!isNonEmptyString(p.url) || !p.url.startsWith("https://")) {
            fields.push({ path: `photos[${idx}].url`, issue: "invalid_url" });
        }
        if (!isNonEmptyString(p.kind)) {
             fields.push({ path: `photos[${idx}].kind`, issue: "required_kind" });
        }
    });

    // Si hay errores, cortar
    if (fields.length > 0) return validationError(res, fields);

    // -----------------------------
    // Normalización Final
    // -----------------------------
    const ownerEmail = String(ownerEmailRaw).trim().toLowerCase();
    const ownerPhone = normalizePhone(String(ownerPhoneRaw));
    
    // -----------------------------
    // Anti-duplicados (Por Placa)
    // -----------------------------
    // Un vehículo solo puede estar postulado una vez en estado pendiente.
    const existing = await supabase
      .from("vehicle_applications")
      .select("id")
      .eq("plate", plateNormalized)
      .limit(1);

    if (existing.error) {
      return res.status(500).json({ error: existing.error.message });
    }
    
    if (existing.data && existing.data.length > 0) {
        // Opcional: Podríamos permitir re-postular si fue rechazado antes, 
        // pero por ahora bloqueamos duplicados exactos de placa.
        return res.status(409).json({
            error: "vehicle_already_exists",
            message: "This vehicle plate is already registered in our system."
        });
    }

    // -----------------------------
    // Insert: vehicle_applications
    // -----------------------------
    // Mapeamos el payload del frontend a las columnas SQL snake_case
    const insertData = {
        // Propietario
        owner_name: String(ownerName).trim(),
        owner_phone: ownerPhone,
        owner_email: ownerEmail,
        owner_city: String(ownerCity).trim(),

        // Vehículo
        plate: plateNormalized,
        brand: String(brand).trim(),
        line: String(line).trim(),
        model_year: year,
        color: String(color).trim(),
        fuel_type: String(fuel).trim(),
        
        // Sugerencias (Flags para auditoría)
        is_brand_suggestion: !!vehicle.isBrandNewSuggestion,
        is_line_suggestion: !!vehicle.isLineNewSuggestion,

        // Negocio
        appointment_date: String(appointmentDate).trim(),
        availability_type: String(availability).trim(),
        expected_daily_rent: expectedPrice,

        // Estado
        mileage: mileage || null,
        soat_expires_at: soatDate || null,
        techno_expires_at: technoDate || null,
        has_all_risk_insurance: hasInsurance,

        // Fotos (JSONB)
        photos: photos, 

        status: 'pending',
        status_reason: null
    };

    const { data, error } = await supabase
      .from("vehicle_applications")
      .insert(insertData)
      .select("id, created_at")
      .single();

    if (error) {
        // Manejo de errores de base de datos
        return res.status(500).json({ error: error.message });
    }

    // -----------------------------
    // Response
    // -----------------------------
    return res.status(201).json({
      id: data.id,
      createdAt: data.created_at,
      message: "Vehicle application received successfully.",
    });

  } catch (e: any) {
    return res.status(500).json({
      error: "internal_error",
      message: e?.message ?? "Unexpected error",
    });
  }
});

export default r;