import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { supabase } from "../lib/supabase";
import { getCurrentOdometers } from "../lib/odometer";

const r = Router();

const VALID_FUEL_LEVELS = ["empty", "1/4", "1/2", "3/4", "full"];
const SELECT_FULL = "*, driver:drivers(id, full_name, phone)";

// --- Helpers compartidos (admin + enlace público de continuación) ---

const parseMileage = (raw: unknown): number | null | undefined => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
};

const parseFuel = (raw: unknown): string | null | undefined => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  return VALID_FUEL_LEVELS.includes(String(raw)) ? String(raw) : null;
};

const parseRoadTest = (raw: unknown): boolean | null | undefined => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  return raw === true || raw === "true";
};

const cleanPhotosOnly = (photos: unknown): Record<string, string> => {
  if (!photos || typeof photos !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(photos as Record<string, unknown>)) {
    if (k === "_damages") continue;
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
};

const parseDamages = (raw: unknown): any[] | undefined => {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d) => d && typeof d === "object")
    .map((d: any, idx: number) => ({
      id: String(d.id || `dmg_${Date.now()}_${idx}`),
      point3d: {
        x: Number(d.point3d?.x) || 0,
        y: Number(d.point3d?.y) || 0,
        z: Number(d.point3d?.z) || 0,
      },
      normal3d: d.normal3d
        ? {
            x: Number(d.normal3d.x) || 0,
            y: Number(d.normal3d.y) || 0,
            z: Number(d.normal3d.z) || 0,
          }
        : undefined,
      viewMode: d.viewMode === "interior" ? "interior" : "exterior",
      zoneId: String(d.zoneId || "body"),
      zoneLabel: String(d.zoneLabel || "Carrocería"),
      category: String(d.category || "body"),
      tags: Array.isArray(d.tags) ? d.tags.map((t: unknown) => String(t)).filter(Boolean) : [],
      severity: d.severity === "grave" || d.severity === "medio" ? d.severity : "leve",
      note: d.note ? String(d.note).trim() : "",
      photoUrl: d.photoUrl ? String(d.photoUrl).trim() : undefined,
      createdAt: d.createdAt ? String(d.createdAt) : new Date().toISOString(),
      author: d.author ? String(d.author).trim() : undefined,
    }));
};

const normalizeInspectionRow = <T extends Record<string, any> | null | undefined>(row: T): T => {
  if (!row || typeof row !== "object") return row;
  const rawPhotos = (row as any).photos;
  const embeddedDamages =
    rawPhotos && typeof rawPhotos === "object" && Array.isArray((rawPhotos as any)._damages)
      ? (rawPhotos as any)._damages
      : undefined;
  const columnDamages = Array.isArray((row as any).damages) ? (row as any).damages : undefined;
  const damages =
    columnDamages && columnDamages.length > 0
      ? columnDamages
      : embeddedDamages || columnDamages || [];

  return {
    ...row,
    photos: cleanPhotosOnly(rawPhotos),
    damages,
  };
};

const hasPhotos = (photos: unknown, damages?: unknown) => {
  const clean = cleanPhotosOnly(photos);
  if (Object.keys(clean).length > 0) return true;
  if (Array.isArray(damages) && damages.some((d: any) => d && typeof d.photoUrl === "string" && d.photoUrl.trim())) {
    return true;
  }
  return false;
};

// Duración efectiva de la revisión: usa elapsed_seconds del cronómetro si viene (descuenta pausas),
// o cae al cálculo pared (completedAt - startedAt) como respaldo.
const computeDuration = (
  startedAt: string | null | undefined,
  completedAt: Date,
  rawElapsed?: unknown
): number | null => {
  if (rawElapsed !== undefined && rawElapsed !== null && rawElapsed !== "") {
    const n = Math.round(Number(rawElapsed));
    if (!isNaN(n) && n >= 0) return n;
  }
  if (!startedAt) return null;
  const secs = Math.round((completedAt.getTime() - new Date(startedAt).getTime()) / 1000);
  return secs >= 0 ? secs : null;
};

const insertLog = async (inspectionId: number | string, actor: string, summary: string) => {
  const { error } = await supabase.from("inspection_logs").insert({
    inspection_id: inspectionId,
    actor_name: actor || "Sin nombre",
    change_summary: summary,
  });
  if (error) console.error("Error creating inspection log:", error.message);
};

// Sincroniza el km en vehicle_mileage_logs (solo cuando la inspección se finaliza)
const syncMileage = async (plate: string, rawMileage: unknown, type: string, id: number) => {
  const mileage = rawMileage === null || rawMileage === undefined ? null : Number(rawMileage);
  if (!mileage || isNaN(mileage) || mileage <= 0) return;
  try {
    await supabase.from("vehicle_mileage_logs").insert({
      plate,
      mileage_km: mileage,
      source: "manual",
      notes: `Inspección de ${type || "general"} (ID: ${id})`,
    });
  } catch (logErr) {
    console.warn("No se pudo insertar en vehicle_mileage_logs (no crítico):", logErr);
  }
};

// Campos editables por quien llena el formulario (borrador o finalización)
const buildFormUpdates = (body: any) => {
  const updates: Record<string, any> = {};
  if (body.driver_id !== undefined) updates.driver_id = body.driver_id || null;
  if (body.type !== undefined) updates.type = body.type || "general";
  const parsedDamages = parseDamages(body.damages);
  if (body.photos !== undefined || parsedDamages !== undefined) {
    const basePhotos = cleanPhotosOnly(body.photos || {});
    if (parsedDamages !== undefined && parsedDamages.length > 0) {
      (basePhotos as any)._damages = parsedDamages;
    }
    updates.photos = basePhotos;
  }
  if (parsedDamages !== undefined) {
    updates.damages = parsedDamages;
  }
  if (body.comments !== undefined) updates.comments = body.comments;
  if (body.inspector_name !== undefined) updates.inspector_name = body.inspector_name;
  const mileage = parseMileage(body.mileage);
  if (mileage !== undefined) updates.mileage = mileage;
  const fuel = parseFuel(body.fuel_level);
  if (fuel !== undefined) updates.fuel_level = fuel;
  const roadTest = parseRoadTest(body.road_test);
  if (roadTest !== undefined) updates.road_test = roadTest;
  return updates;
};

const isMissingDamagesColumnError = (err: any) => {
  const msg = String(err?.message || "");
  return msg.includes("damages") && (msg.includes("schema cache") || msg.includes("column"));
};

// 1. GET /inspections - Traer historial global (Últimas 100) + todos los borradores abiertos
r.get("/", async (_req: Request, res: Response) => {
  try {
    const [recent, drafts] = await Promise.all([
      supabase.from("inspections").select(SELECT_FULL).order("created_at", { ascending: false }).limit(100),
      supabase.from("inspections").select(SELECT_FULL).eq("status", "draft").order("created_at", { ascending: false }),
    ]);
    if (recent.error) throw new Error(recent.error.message);
    if (drafts.error) throw new Error(drafts.error.message);

    // Los borradores nunca se pierden del listado aunque sean viejos
    const map = new Map<number, any>();
    for (const row of [...(drafts.data || []), ...(recent.data || [])]) {
      map.set(row.id, normalizeInspectionRow(row));
    }
    const data = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. POST /inspections - Crear inspección (finalizada directamente o como borrador)
// body.status = "draft" → guarda avance sin exigir fotos y genera enlace de continuación
r.post("/", async (req: Request, res: Response) => {
  const body = req.body;
  const isDraft = body.status === "draft";

  try {
    if (!body.vehicle_plate) return res.status(400).json({ error: "Falta la placa" });
    if (!isDraft && !hasPhotos(body.photos, body.damages)) {
      return res.status(400).json({ error: "Debes subir al menos una foto" });
    }

    const plate = String(body.vehicle_plate).toUpperCase().trim();
    const now = new Date();
    const startedAt = body.started_at ? new Date(body.started_at).toISOString() : now.toISOString();

    const insertPayload: Record<string, any> = {
      vehicle_plate: plate,
      type: "general",
      photos: {},
      ...buildFormUpdates(body),
      status: isDraft ? "draft" : "completed",
      continue_token: isDraft ? randomUUID() : null,
      started_at: startedAt,
      completed_at: isDraft ? null : now.toISOString(),
      duration_seconds: computeDuration(startedAt, now, body.elapsed_seconds),
    };

    let { data, error } = await supabase
      .from("inspections")
      .insert(insertPayload)
      .select(SELECT_FULL)
      .single();

    if (error && isMissingDamagesColumnError(error)) {
      const { damages: _omit, ...fallbackPayload } = insertPayload;
      const retry = await supabase.from("inspections").insert(fallbackPayload).select(SELECT_FULL).single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw new Error(error.message);

    await insertLog(data.id, body.inspector_name, isDraft ? "Inicia inspección y guarda avance (borrador)" : "Inspección creada y finalizada");
    if (!isDraft) await syncMileage(plate, data.mileage, data.type, data.id);

    return res.status(201).json(normalizeInspectionRow(data));
  } catch (err: any) {
    console.error("Error saving inspection:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. GET /inspections/:plate - Ver historial de un carro específico
r.get("/:plate", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "");
  if (!plate) return res.status(400).json({ error: "Plate required" });

  try {
    const { data, error } = await supabase
      .from("inspections")
      .select(SELECT_FULL)
      .eq("vehicle_plate", plate.toUpperCase())
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return res.json((data || []).map(normalizeInspectionRow));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. PUT /inspections/:id - Editar una inspección (admin) y generar log de auditoría
r.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body;

  try {
    const parsedDamages = parseDamages(body.damages);
    const basePhotos = cleanPhotosOnly(body.photos || {});
    if (parsedDamages !== undefined && parsedDamages.length > 0) {
      (basePhotos as any)._damages = parsedDamages;
    }

    const updates: Record<string, any> = {
      photos: basePhotos,
      comments: body.comments,
      type: body.type,
    };
    if (parsedDamages !== undefined) updates.damages = parsedDamages;
    const fuel = parseFuel(body.fuel_level);
    if (fuel !== undefined) updates.fuel_level = fuel;
    const mileage = parseMileage(body.mileage);
    if (mileage !== undefined) updates.mileage = mileage;
    const roadTest = parseRoadTest(body.road_test);
    if (roadTest !== undefined) updates.road_test = roadTest;

    let { data: updatedInspection, error: updateError } = await supabase
      .from("inspections")
      .update(updates)
      .eq("id", id)
      .select(SELECT_FULL)
      .single();

    if (updateError && isMissingDamagesColumnError(updateError)) {
      const { damages: _omit, ...fallbackUpdates } = updates;
      const retry = await supabase
        .from("inspections")
        .update(fallbackUpdates)
        .eq("id", id)
        .select(SELECT_FULL)
        .single();
      updatedInspection = retry.data;
      updateError = retry.error;
    }

    if (updateError) throw new Error(updateError.message);

    await insertLog(String(id), body.editor_name || "Admin", body.change_summary || "Actualización de datos (Edición manual)");

    return res.json({ success: true, inspection: normalizeInspectionRow(updatedInspection) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. GET /inspections/:id/logs - Ver el historial de cambios (Logs)
r.get("/:id/logs", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("inspection_logs")
      .select("*")
      .eq("inspection_id", id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Router Público (sin Basic Auth): visor de solo lectura y enlace de continuación de borradores
export const publicInspectionsRoutes = Router();

const loadParticipants = async (inspectionId: number): Promise<string[]> => {
  const { data } = await supabase
    .from("inspection_logs")
    .select("actor_name, created_at")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });
  const names: string[] = [];
  for (const row of data || []) {
    const n = String(row.actor_name || "").trim();
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
  }
  return names;
};

// 6.1 GET /public/inspections/continue/:token - Cargar borrador para continuarlo
publicInspectionsRoutes.get("/continue/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const { data, error } = await supabase
      .from("inspections")
      .select("*, driver:drivers(id, full_name, phone)")
      .eq("continue_token", token)
      .maybeSingle();

    if (error || !data) return res.status(404).json({ error: "Enlace de inspección no válido" });

    // Último km conocido del vehículo (referencia para quien continúa)
    const odometers = await getCurrentOdometers([data.vehicle_plate]);
    const lastKm = { mileage_km: odometers.get(data.vehicle_plate) ?? null };


    // Daños registrados en la última inspección cerrada de esta placa (para poder precargar preexistentes)
    const { data: prevInsp } = await supabase
      .from("inspections")
      .select("*")
      .eq("vehicle_plate", data.vehicle_plate)
      .eq("status", "completed")
      .neq("id", data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const normalizedPrev = normalizeInspectionRow(prevInsp);
    const normalized = normalizeInspectionRow(data);
    const participants = await loadParticipants(data.id);
    return res.json({
      ...normalized,
      participants,
      last_known_mileage: lastKm?.mileage_km ?? null,
      previous_damages: normalizedPrev?.damages || [],
      previous_inspection_date: normalizedPrev?.created_at || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6.2 PUT /public/inspections/continue/:token - Guardar avance o finalizar (body.finalize = true)
publicInspectionsRoutes.put("/continue/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const body = req.body;
  const finalize = body.finalize === true;

  try {
    const { data: current, error: findErr } = await supabase
      .from("inspections")
      .select("id, status, started_at, vehicle_plate, photos")
      .eq("continue_token", token)
      .maybeSingle();

    if (findErr || !current) return res.status(404).json({ error: "Enlace de inspección no válido" });
    if (current.status === "completed") {
      return res.status(409).json({ error: "Esta inspección ya fue finalizada y no se puede editar" });
    }
    if (!String(body.inspector_name || "").trim()) {
      return res.status(400).json({ error: "Escribe tu nombre para registrar quién hizo este avance" });
    }

    const updates = buildFormUpdates(body);
    const photos = updates.photos !== undefined ? updates.photos : current.photos;

    if (finalize) {
      if (!hasPhotos(photos, body.damages)) return res.status(400).json({ error: "Debes subir al menos una foto" });
      const now = new Date();
      updates.status = "completed";
      updates.completed_at = now.toISOString();
      updates.duration_seconds = computeDuration(current.started_at, now, body.elapsed_seconds);
    } else if (body.elapsed_seconds !== undefined && body.elapsed_seconds !== null) {
      const n = Math.round(Number(body.elapsed_seconds));
      if (!isNaN(n) && n >= 0) updates.duration_seconds = n;
    }

    let { data, error } = await supabase
      .from("inspections")
      .update(updates)
      .eq("id", current.id)
      .eq("status", "draft") // evita doble finalización concurrente
      .select("*, driver:drivers(id, full_name, phone)")
      .maybeSingle();

    if (error && isMissingDamagesColumnError(error)) {
      const { damages: _omit, ...fallbackUpdates } = updates;
      const retry = await supabase
        .from("inspections")
        .update(fallbackUpdates)
        .eq("id", current.id)
        .eq("status", "draft")
        .select("*, driver:drivers(id, full_name, phone)")
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw new Error(error.message);
    if (!data) return res.status(409).json({ error: "Esta inspección ya fue finalizada por otra persona" });

    await insertLog(data.id, body.inspector_name, finalize ? "Finaliza la inspección" : "Guarda avance (borrador)");
    if (finalize) await syncMileage(data.vehicle_plate, data.mileage, data.type, data.id);

    const participants = await loadParticipants(data.id);
    return res.json({ ...normalizeInspectionRow(data), participants });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6.3 GET /public/inspections/:id - Visor público de solo lectura
publicInspectionsRoutes.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("inspections")
      .select("*, driver:drivers(full_name)")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Inspección no encontrada" });
    }
    const normalized = normalizeInspectionRow(data);
    delete (normalized as any).continue_token;
    const participants = await loadParticipants(data.id);
    return res.json({ ...normalized, participants });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default r;
