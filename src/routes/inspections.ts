import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { supabase } from "../lib/supabase";

const r = Router();

const VALID_FUEL_LEVELS = ["empty", "1/4", "1/2", "3/4", "full"];
const SELECT_FULL = "*, driver:drivers(id, full_name, phone)";

// --- Helpers compartidos (admin + enlace pÃºblico de continuaciÃ³n) ---

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

const hasPhotos = (photos: unknown) =>
  !!photos && typeof photos === "object" && Object.keys(photos as object).length > 0;

// DuraciÃ³n total de la revisiÃ³n: desde que se iniciÃ³ hasta que se finalizÃ³ (incluye pausas entre personas)
const computeDuration = (startedAt: string | null | undefined, completedAt: Date): number | null => {
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

// Sincroniza el km en vehicle_mileage_logs (solo cuando la inspecciÃ³n se finaliza)
const syncMileage = async (plate: string, rawMileage: unknown, type: string, id: number) => {
  const mileage = rawMileage === null || rawMileage === undefined ? null : Number(rawMileage);
  if (!mileage || isNaN(mileage) || mileage <= 0) return;
  try {
    await supabase.from("vehicle_mileage_logs").insert({
      plate,
      mileage_km: mileage,
      source: "manual",
      notes: `InspecciÃ³n de ${type || "general"} (ID: ${id})`,
    });
  } catch (logErr) {
    console.warn("No se pudo insertar en vehicle_mileage_logs (no crÃ­tico):", logErr);
  }
};

// Campos editables por quien llena el formulario (borrador o finalizaciÃ³n)
const buildFormUpdates = (body: any) => {
  const updates: Record<string, any> = {};
  if (body.driver_id !== undefined) updates.driver_id = body.driver_id || null;
  if (body.type !== undefined) updates.type = body.type || "general";
  if (body.photos !== undefined) updates.photos = body.photos || {};
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

// 1. GET /inspections - Traer historial global (Ãšltimas 100) + todos los borradores abiertos
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
    for (const row of [...(drafts.data || []), ...(recent.data || [])]) map.set(row.id, row);
    const data = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. POST /inspections - Crear inspecciÃ³n (finalizada directamente o como borrador)
// body.status = "draft" â†’ guarda avance sin exigir fotos y genera enlace de continuaciÃ³n
r.post("/", async (req: Request, res: Response) => {
  const body = req.body;
  const isDraft = body.status === "draft";

  try {
    if (!body.vehicle_plate) return res.status(400).json({ error: "Falta la placa" });
    if (!isDraft && !hasPhotos(body.photos)) {
      return res.status(400).json({ error: "Debes subir al menos una foto" });
    }

    const plate = String(body.vehicle_plate).toUpperCase().trim();
    const now = new Date();
    const startedAt = body.started_at ? new Date(body.started_at).toISOString() : now.toISOString();

    const { data, error } = await supabase
      .from("inspections")
      .insert({
        vehicle_plate: plate,
        type: "general",
        photos: {},
        ...buildFormUpdates(body),
        status: isDraft ? "draft" : "completed",
        continue_token: isDraft ? randomUUID() : null,
        started_at: startedAt,
        completed_at: isDraft ? null : now.toISOString(),
        duration_seconds: isDraft ? null : computeDuration(startedAt, now),
      })
      .select(SELECT_FULL)
      .single();

    if (error) throw new Error(error.message);

    await insertLog(data.id, body.inspector_name, isDraft ? "Inicia inspecciÃ³n y guarda avance (borrador)" : "InspecciÃ³n creada y finalizada");
    if (!isDraft) await syncMileage(plate, data.mileage, data.type, data.id);

    return res.status(201).json(data);
  } catch (err: any) {
    console.error("Error saving inspection:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. GET /inspections/:plate - Ver historial de un carro especÃ­fico
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
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. PUT /inspections/:id - Editar una inspecciÃ³n (admin) y generar log de auditorÃ­a
r.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body;

  try {
    const updates: Record<string, any> = {
      photos: body.photos,
      comments: body.comments,
      type: body.type,
    };
    const fuel = parseFuel(body.fuel_level);
    if (fuel !== undefined) updates.fuel_level = fuel;
    const mileage = parseMileage(body.mileage);
    if (mileage !== undefined) updates.mileage = mileage;
    const roadTest = parseRoadTest(body.road_test);
    if (roadTest !== undefined) updates.road_test = roadTest;

    const { data: updatedInspection, error: updateError } = await supabase
      .from("inspections")
      .update(updates)
      .eq("id", id)
      .select(SELECT_FULL)
      .single();

    if (updateError) throw new Error(updateError.message);

    await insertLog(String(id), body.editor_name || "Admin", body.change_summary || "ActualizaciÃ³n de datos (EdiciÃ³n manual)");

    return res.json({ success: true, inspection: updatedInspection });
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

// 6. Router PÃºblico (sin Basic Auth): visor de solo lectura y enlace de continuaciÃ³n de borradores
export const publicInspectionsRoutes = Router();

const PUBLIC_FIELDS =
  "id, vehicle_plate, created_at, type, mileage, fuel_level, comments, inspector_name, photos, status, started_at, completed_at, duration_seconds, road_test, driver:drivers(full_name)";

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

    if (error || !data) return res.status(404).json({ error: "Enlace de inspecciÃ³n no vÃ¡lido" });

    // Ãšltimo km conocido del vehÃ­culo (referencia para quien continÃºa)
    const { data: lastKm } = await supabase
      .from("vehicle_mileage_logs")
      .select("mileage_km")
      .eq("plate", data.vehicle_plate)
      .order("mileage_km", { ascending: false })
      .limit(1)
      .maybeSingle();

    const participants = await loadParticipants(data.id);
    return res.json({ ...data, participants, last_known_mileage: lastKm?.mileage_km ?? null });
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

    if (findErr || !current) return res.status(404).json({ error: "Enlace de inspecciÃ³n no vÃ¡lido" });
    if (current.status === "completed") {
      return res.status(409).json({ error: "Esta inspecciÃ³n ya fue finalizada y no se puede editar" });
    }
    if (!String(body.inspector_name || "").trim()) {
      return res.status(400).json({ error: "Escribe tu nombre para registrar quiÃ©n hizo este avance" });
    }

    const updates = buildFormUpdates(body);
    const photos = updates.photos !== undefined ? updates.photos : current.photos;

    if (finalize) {
      if (!hasPhotos(photos)) return res.status(400).json({ error: "Debes subir al menos una foto" });
      const now = new Date();
      updates.status = "completed";
      updates.completed_at = now.toISOString();
      updates.duration_seconds = computeDuration(current.started_at, now);
    }

    const { data, error } = await supabase
      .from("inspections")
      .update(updates)
      .eq("id", current.id)
      .eq("status", "draft") // evita doble finalizaciÃ³n concurrente
      .select("*, driver:drivers(id, full_name, phone)")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return res.status(409).json({ error: "Esta inspecciÃ³n ya fue finalizada por otra persona" });

    await insertLog(data.id, body.inspector_name, finalize ? "Finaliza la inspecciÃ³n" : "Guarda avance (borrador)");
    if (finalize) await syncMileage(data.vehicle_plate, data.mileage, data.type, data.id);

    const participants = await loadParticipants(data.id);
    return res.json({ ...data, participants });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6.3 GET /public/inspections/:id - Visor pÃºblico de solo lectura
publicInspectionsRoutes.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("inspections")
      .select(PUBLIC_FIELDS)
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "InspecciÃ³n no encontrada" });
    }
    const participants = await loadParticipants(data.id);
    return res.json({ ...data, participants });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default r;
