import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /fleet-map/top-1
 * Returns the single primary parking hotspot (rank_order = 1) for every
 * active or maintenance vehicle in the fleet.
 *
 * Join strategy: fetch vehicle_top_locations WHERE rank_order = 1, then
 * cross-reference with the vehicles table to pull plate, owner_name and status,
 * filtering out sold/inactive units so the map stays operationally relevant.
 */
r.get("/top-1", async (_req: Request, res: Response) => {
  try {
    // 1. Pull all rank-1 hotspots joined to vehicles in a single round-trip.
    //    Supabase PostgREST supports embedded selects via foreign keys; here we
    //    rely on the plate FK declared in vehicle_top_locations → vehicles.
    const { data, error } = await supabase
      .from("vehicle_top_locations")
      .select(`
        latitude,
        longitude,
        total_parked_hours,
        last_seen_at,
        plate,
        vehicles!inner (
          plate,
          owner_name,
          status,
          brand,
          line
        )
      `)
      .eq("rank_order", 1)
      .in("vehicles.status", ["active", "maintenance"]);

    if (error) {
      console.error("[FLEET-MAP] Supabase query error:", error.message);
      return res.status(500).json({ error: error.message });
    }

    // 2. Flatten the nested vehicles object for a clean API response
    const payload = (data || []).map((row: any) => ({
      plate:              row.vehicles?.plate ?? row.plate,
      owner_name:         row.vehicles?.owner_name ?? "Sin asignar",
      status:             row.vehicles?.status ?? "active",
      brand:              row.vehicles?.brand ?? null,
      line:               row.vehicles?.line ?? null,
      latitude:           Number(row.latitude),
      longitude:          Number(row.longitude),
      total_parked_hours: Number(row.total_parked_hours ?? 0),
      last_seen_at:       row.last_seen_at,
    }));

    return res.json(payload);
  } catch (err: any) {
    console.error("[FLEET-MAP] Unexpected error:", err.message);
    return res.status(500).json({ error: err?.message });
  }
});

export default r;
