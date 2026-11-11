import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

type AppPhoto = { url: string; kind?: string; is_cover_worthy?: boolean };

/**
 * Elige portada e interior a partir de las fotos etiquetadas por IA (vehicleImageClassifier).
 * Invariante: la foto interior nunca es la misma que la portada.
 */
function pickCatalogPhotos(photos: unknown): { exterior: string | null; interior: string | null } {
  const list: AppPhoto[] = Array.isArray(photos) ? photos.filter((p: any) => p && typeof p.url === "string") : [];
  const cover =
    list.find(p => p.is_cover_worthy) ||
    list.find(p => p.kind === "exterior") ||
    list.find(p => p.kind !== "interior") ||
    list[0];
  const interior = list.find(p => p.kind === "interior" && p.url !== cover?.url);
  return { exterior: cover?.url ?? null, interior: interior?.url ?? null };
}

/**
 * GET /marketplace/catalog
 * Público. Vitrina de vehículos aprobados y publicados por el admin.
 * Desde el ticket #38 la fuente es `vehicle_applications` (captación única);
 * `marketplace_cars` quedó retirada. Filtro opcional ?type=rent|sale.
 */
r.get("/catalog", async (req: Request, res: Response) => {
  try {
    const filterType = typeof req.query.type === "string" ? req.query.type.toLowerCase() : null;

    let query = supabase
      .from("vehicle_applications")
      .select("id, brand, line, model_year, transmission, fuel_type, expected_daily_rent, sale_price, listing_type, accepts_public_contact, photos, owner_city, owner_name, owner_phone")
      .eq("status", "approved")
      .eq("published_in_catalog", true)
      .order("created_at", { ascending: false });

    if (filterType === "rent") {
      query = query.in("listing_type", ["rent", "both"]);
    } else if (filterType === "sale") {
      query = query.in("listing_type", ["sale", "both"]);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Mantiene el contrato histórico del catálogo (RentCatalog.tsx)
    const cars = (data || []).map((app: any) => {
      const listingType = app.listing_type || "rent";
      const { exterior, interior } = pickCatalogPhotos(app.photos);
      // El contacto del dueño solo se expone en ventas autorizadas (Ley 1581); la renta va por AllAtYou
      const exposeOwner = listingType !== "rent" && app.accepts_public_contact === true;
      return {
        id: app.id,
        brand: app.brand,
        model: app.line,
        year: app.model_year,
        transmission: app.transmission || "—",
        fuel_type: app.fuel_type,
        price_per_day: listingType === "sale" ? 0 : Number(app.expected_daily_rent) || 0,
        sale_price: listingType === "rent" ? null : app.sale_price ? Number(app.sale_price) : null,
        listing_type: listingType,
        photo_exterior_url: exterior,
        photo_interior_url: interior,
        owner_city: app.owner_city,
        owner_name: exposeOwner ? app.owner_name : undefined,
        owner_phone: exposeOwner ? app.owner_phone : undefined,
      };
    });

    return res.json(cars);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /marketplace/upload — retirado en el ticket #38.
 * La captación de vehículos es única: POST /vehicle-applications (formulario de /#propietarios y /rent-your-car).
 */
r.post("/upload", (_req: Request, res: Response) => {
  return res.status(410).json({
    error: "endpoint_retired",
    message: "Este formulario ya no está disponible. Registra tu vehículo en https://www.allatyou.com/rent-your-car",
  });
});

export default r;
