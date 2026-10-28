import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { classifyVehiclePhotos } from "../lib/vehicleImageClassifier";

const r = Router();

/**
 * Detecta cadenas aleatorias generadas por bots (ej: "ywHraBYLhrnSzmhmzFb GyEGEuhoXgywAorfx")
 * sin bloquear apellidos o nombres reales con mayúsculas internas (ej: McDonald, DiCaprio).
 */
function isGibberishText(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const clean = v.trim();
  if (!clean) return false;

  const words = clean.split(/\s+/);
  for (const word of words) {
    if (word.length > 25) return true;
    if (/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]{6,}/.test(word)) {
      return true;
    }
    // Solo evaluar alternancia caótica en palabras largas (>= 10 letras)
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

/**
 * GET /marketplace/catalog
 * Público. Trae los carros DISPONIBLES para rentar.
 * Filtra por status = 'approved'.
 */
r.get("/catalog", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("marketplace_cars")
      .select("id, brand, model, year, transmission, price_per_day, photo_exterior_url, owner_city")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /marketplace/upload
 * Público. Permite a un dueño subir su vehículo para revisión.
 */
r.post("/upload", async (req: Request, res: Response) => {
  const body = req.body ?? {};

  try {
    // 1. Honeypot anti-bots
    if (typeof body.website === "string" && body.website.trim().length > 0) {
      return res.status(400).json({ error: "Solicitud bloqueada por filtro anti-spam." });
    }

    // 2. Validaciones básicas de presencia
    if (!body.owner_name || !body.owner_phone || !body.brand || !body.model || !body.plate) {
      return res.status(400).json({
        error: "Por favor completa todos los datos obligatorios (Nombre, Celular, Marca, Línea y Placa).",
      });
    }

    // 3. Anti-basura (bots que envían "ywHraBYLhrnSzmhmzFb GyEGEuhoXgywAorfx")
    if (isGibberishText(body.owner_name)) {
      return res.status(422).json({
        error: "Revisa el nombre, parece tener un error de escritura.",
      });
    }
    if (isGibberishText(body.brand) || isGibberishText(body.model)) {
      return res.status(422).json({
        error: "Revisa la marca o línea del vehículo, parece tener un error de escritura.",
      });
    }

    // 4. Validar placa colombiana (3 letras + 3 números, ej: ABC123)
    const normalizedPlate = String(body.plate).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]{3}\d{3}$/.test(normalizedPlate)) {
      return res.status(422).json({
        error: "Ingresa una placa válida de 6 caracteres (3 letras y 3 números, ej: ABC123).",
      });
    }

    // 5. Validar teléfono celular (quitar prefijo 57 solo si tiene más de 10 dígitos)
    let cleanPhone = String(body.owner_phone).replace(/\D/g, "");
    if (cleanPhone.length > 10 && cleanPhone.startsWith("57")) {
      cleanPhone = cleanPhone.slice(2);
    }
    if (!/^3\d{9}$/.test(cleanPhone)) {
      return res.status(422).json({
        error: "Ingresa un número de celular colombiano válido de 10 dígitos (ej: 3001234567).",
      });
    }

    // 6. Validar correo electrónico
    if (!body.owner_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.owner_email).trim())) {
      return res.status(400).json({ error: "Ingresa un correo electrónico válido para notificaciones." });
    }

    // 7. Validar año (1990 al año siguiente)
    const parsedYear = parseInt(String(body.year), 10);
    const currentYear = new Date().getFullYear();
    if (Number.isNaN(parsedYear) || parsedYear < 1990 || parsedYear > currentYear + 1) {
      return res.status(422).json({ error: `Ingresa un año válido entre 1990 y ${currentYear + 1}.` });
    }

    // 8. Normalizar y validar fotos (soporta arreglo flexible photos[] o campos individuales)
    const allowedBucketPrefix = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
    const rawPhotosList = Array.isArray(body.photos) ? body.photos : [];
    const validPhotoUrls: string[] = [];

    // Validar fotos del arreglo photos[]
    for (const p of rawPhotosList) {
      const urlStr = typeof p === "string" ? p.trim() : (p && typeof p.url === "string") ? p.url.trim() : "";
      if (urlStr) {
        const isAllowedOrigin = allowedBucketPrefix
          ? urlStr.startsWith(`${allowedBucketPrefix}/`)
          : urlStr.startsWith("https://");
        if (!isAllowedOrigin) {
          return res.status(422).json({ error: "URL de fotografía no permitida o inválida." });
        }
        validPhotoUrls.push(urlStr);
      }
    }

    // Compatibilidad hacia atrás con campos directos photo_exterior_url / photo_interior_url
    for (const photoField of ["photo_exterior_url", "photo_interior_url"] as const) {
      const rawUrl = body[photoField];
      if (rawUrl && typeof rawUrl === "string") {
        const urlStr = rawUrl.trim();
        const isAllowedOrigin = allowedBucketPrefix
          ? urlStr.startsWith(`${allowedBucketPrefix}/`)
          : urlStr.startsWith("https://");
        if (!isAllowedOrigin) {
          return res.status(422).json({ error: "URL de fotografía inválida." });
        }
        if (!validPhotoUrls.includes(urlStr)) {
          validPhotoUrls.push(urlStr);
        }
      }
    }

    const initialExterior = validPhotoUrls[0] || body.photo_exterior_url || null;
    const initialInterior = validPhotoUrls[1] || body.photo_interior_url || null;

    // 9. Anti-duplicados por placa
    const existing = await supabase
      .from("marketplace_cars")
      .select("id")
      .eq("plate", normalizedPlate)
      .limit(1);

    if (existing.error) {
      return res.status(500).json({ error: existing.error.message });
    }

    if (existing.data && existing.data.length > 0) {
      return res.status(409).json({
        error: `El vehículo con placa ${normalizedPlate} ya se encuentra registrado en nuestro sistema.`,
        code: "vehicle_already_exists",
      });
    }

    const { data, error } = await supabase
      .from("marketplace_cars")
      .insert({
        owner_name: String(body.owner_name).trim(),
        owner_phone: cleanPhone,
        owner_email: String(body.owner_email).trim().toLowerCase(),
        owner_city: body.owner_city || "Cali",
        brand: String(body.brand).trim(),
        model: String(body.model).trim(),
        year: parsedYear,
        transmission: body.transmission || "Automática",
        fuel_type: body.fuel_type || "Gasolina",
        plate: normalizedPlate,
        price_per_day: Number(body.price_per_day) || 0,
        photo_exterior_url: initialExterior,
        photo_interior_url: initialInterior,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Auto-clasificación con IA en segundo plano para seleccionar la mejor portada
    if (validPhotoUrls.length > 0) {
      setImmediate(async () => {
        try {
          const classified = await classifyVehiclePhotos(validPhotoUrls.map(url => ({ url })));
          const bestExterior = classified.find(p => p.is_cover_worthy) || classified.find(p => p.kind === "exterior");
          const bestInterior = classified.find(p => p.kind === "interior");

          const updates: Record<string, string | null> = {};
          if (bestExterior && bestExterior.url !== initialExterior) {
            updates.photo_exterior_url = bestExterior.url;
          }
          if (bestInterior && bestInterior.url !== initialInterior) {
            updates.photo_interior_url = bestInterior.url;
          }

          if (Object.keys(updates).length > 0) {
            await supabase.from("marketplace_cars").update(updates).eq("id", data.id);
            console.log(`[AI] Portada y fotos optimizadas para Marketplace car #${data.id}`);
          }
        } catch (aiErr) {
          console.warn("⚠️ Error en auto-etiquetado IA marketplace:", aiErr);
        }
      });
    }

    return res.status(201).json({ success: true, car: data });
  } catch (err: any) {
    console.error("Error uploading car:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN ENDPOINTS (Protegidos con basicAuth desde src/index.ts en /marketplace/admin) ---

r.get("/admin/all", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("marketplace_cars")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

r.put("/admin/:id/status", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' | 'rejected' | 'pending'

  const { data, error } = await supabase
    .from("marketplace_cars")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

export default r;
