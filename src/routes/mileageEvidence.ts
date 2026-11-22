// src/routes/mileageEvidence.ts
// Evidencia de kilometraje y gasolina por link de WhatsApp (Issue #75).
//
// Flujo:
//   1. Admin (basicAuth) genera un link único por vehículo: POST /mileage-evidence/:plate
//   2. El frontend abre wa.me al conductor con el link /km/:token
//   3. El conductor (público, sin login) digita el km — debe ser MAYOR al odómetro
//      anterior —, elige el nivel de combustible y sube la foto del tablero:
//      POST /public/mileage-evidence/:token (multipart)
//   4. Se inserta la lectura en vehicle_mileage_logs (source = 'manual', absoluta) y la
//      solicitud queda 'completed' (un solo uso).
// Reglas en docs/specs/kilometraje-evidencia.md
import { Router, Request, Response } from "express";
import crypto from "crypto";
import multer from "multer";
import { supabase } from "../lib/supabase";
import { getCurrentOdometers } from "../lib/odometer";
import { uploadToR2 } from "../lib/r2";

const VALID_FUEL_LEVELS = ["empty", "1/4", "1/2", "3/4", "full"];
const LINK_TTL_DAYS = 7;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

// ==========================================
// ADMIN (montado con basicAuth en /mileage-evidence)
// ==========================================
const r = Router();

// GET /mileage-evidence/:plate — historial de solicitudes del vehículo
r.get("/:plate", async (req: Request, res: Response) => {
  const plate = String(req.params.plate).toUpperCase();
  const { data, error } = await supabase
    .from("mileage_evidence_requests")
    .select("id, token, plate, driver_name, status, previous_mileage_km, mileage_km, fuel_level, photo_url, mileage_log_id, created_by, created_at, expires_at, completed_at")
    .eq("plate", plate)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
});

// POST /mileage-evidence/:plate — genera un link nuevo para el conductor actual
r.post("/:plate", async (req: Request, res: Response) => {
  try {
    const plate = String(req.params.plate).toUpperCase();

    const { data: vehicle, error: vErr } = await supabase
      .from("vehicles")
      .select("plate, current_driver_id, driver:drivers!current_driver_id (id, full_name, phone)")
      .eq("plate", plate)
      .maybeSingle();
    if (vErr) return res.status(500).json({ error: vErr.message });
    if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });

    const driver: any = Array.isArray((vehicle as any).driver) ? (vehicle as any).driver[0] : (vehicle as any).driver;
    const odometers = await getCurrentOdometers([plate]);

    const token = crypto.randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("mileage_evidence_requests")
      .insert({
        token,
        plate,
        driver_id: driver?.id != null ? String(driver.id) : null,
        driver_name: driver?.full_name || null,
        previous_mileage_km: odometers.get(plate) ?? null,
        created_by: req.adminUser?.email || "legacy",
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ ...data, driver_phone: driver?.phone || null });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Error generando el link" });
  }
});

// ==========================================
// PÚBLICO (conductor, sin auth) en /public/mileage-evidence
// ==========================================
export const publicMileageEvidenceRoutes = Router();

async function loadRequest(token: string) {
  const { data, error } = await supabase
    .from("mileage_evidence_requests")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Odómetro de referencia: el actual (manual + GPS) al momento de responder,
// o el que se congeló al crear el link si es mayor.
async function referenceMileage(plate: string, frozen: number | null): Promise<number | null> {
  const current = (await getCurrentOdometers([plate])).get(plate) ?? null;
  const vals = [current, frozen != null ? Number(frozen) : null].filter((v): v is number => v != null && isFinite(v));
  return vals.length ? Math.max(...vals) : null;
}

// GET /public/mileage-evidence/:token
publicMileageEvidenceRoutes.get("/:token", async (req: Request, res: Response) => {
  try {
    const reqRow = await loadRequest(String(req.params.token));
    if (!reqRow) return res.status(404).json({ error: "Link inválido" });

    const expired = reqRow.status === "pending" && new Date(reqRow.expires_at).getTime() < Date.now();
    const previous = reqRow.status === "pending" ? await referenceMileage(reqRow.plate, reqRow.previous_mileage_km) : reqRow.previous_mileage_km;

    return res.json({
      plate: reqRow.plate,
      driver_name: reqRow.driver_name,
      status: expired ? "expired" : reqRow.status,
      previous_mileage_km: previous != null ? Number(previous) : null,
      mileage_km: reqRow.mileage_km != null ? Number(reqRow.mileage_km) : null,
      fuel_level: reqRow.fuel_level,
      completed_at: reqRow.completed_at,
      expires_at: reqRow.expires_at,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// POST /public/mileage-evidence/:token — multipart: file (foto tablero), mileage_km, fuel_level
publicMileageEvidenceRoutes.post("/:token", (req: Request, res: Response, next) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "La foto es demasiado pesada (máximo 30MB)." });
      }
      return res.status(400).json({ error: err.message || "Error subiendo la foto" });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const reqRow = await loadRequest(String(req.params.token));
    if (!reqRow) return res.status(404).json({ error: "Link inválido" });
    if (reqRow.status !== "pending") return res.status(409).json({ error: "Este link ya fue usado." });
    if (new Date(reqRow.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: "Este link venció. Pide uno nuevo a la oficina." });
    }

    const mileage = Number(String(req.body.mileage_km ?? "").replace(/\D/g, ""));
    if (!mileage || !isFinite(mileage) || mileage <= 0) {
      return res.status(400).json({ error: "Digita el kilometraje del tablero." });
    }

    const fuel = String(req.body.fuel_level || "");
    if (!VALID_FUEL_LEVELS.includes(fuel)) {
      return res.status(400).json({ error: "Selecciona el nivel de gasolina." });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: "Sube la foto del tablero como evidencia." });
    if (!file.mimetype.startsWith("image/")) return res.status(400).json({ error: "La evidencia debe ser una foto." });

    const previous = await referenceMileage(reqRow.plate, reqRow.previous_mileage_km);
    if (previous != null && mileage <= previous) {
      return res.status(400).json({
        error: `El kilometraje debe ser mayor al anterior (${previous.toLocaleString("es-CO")} km).`,
        previous_mileage_km: previous,
      });
    }

    const photoUrl = await uploadToR2(file, "mileage-evidence");
    const now = new Date().toISOString();

    const { data: log, error: logErr } = await supabase
      .from("vehicle_mileage_logs")
      .insert({
        plate: reqRow.plate,
        mileage_km: mileage,
        recorded_at: now,
        source: "manual",
        notes: `Evidencia conductor (link WhatsApp)${reqRow.driver_name ? ` — ${reqRow.driver_name}` : ""} · Gasolina: ${fuel}`,
      })
      .select("id")
      .single();
    if (logErr) return res.status(500).json({ error: logErr.message });

    // Solo actualiza si sigue pendiente (evita doble envío simultáneo)
    const { data: updated, error: upErr } = await supabase
      .from("mileage_evidence_requests")
      .update({
        status: "completed",
        mileage_km: mileage,
        fuel_level: fuel,
        photo_url: photoUrl,
        previous_mileage_km: previous,
        mileage_log_id: log.id,
        completed_at: now,
      })
      .eq("id", reqRow.id)
      .eq("status", "pending")
      .select("id");
    if (upErr) return res.status(500).json({ error: upErr.message });
    if (!updated || updated.length === 0) {
      await supabase.from("vehicle_mileage_logs").delete().eq("id", log.id);
      return res.status(409).json({ error: "Este link ya fue usado." });
    }

    return res.status(201).json({ ok: true, mileage_km: mileage, fuel_level: fuel });
  } catch (err: any) {
    console.error("[mileage-evidence] error:", err);
    return res.status(500).json({ error: err?.message || "Error guardando la evidencia" });
  }
});

export default r;
