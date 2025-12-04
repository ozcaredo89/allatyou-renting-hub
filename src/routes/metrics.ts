// src/routes/metrics.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// helper para insertar evento
async function insertEvent(type: "landing_view" | "pico_placa_use") {
  return supabase.from("landing_events").insert({ type });
}

// POST /metrics/landing-view
r.post("/landing-view", async (_req: Request, res: Response) => {
  const { error } = await insertEvent("landing_view");
  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).send();
});

// POST /metrics/pico-placa-use
r.post("/pico-placa-use", async (_req: Request, res: Response) => {
  const { error } = await insertEvent("pico_placa_use");
  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).send();
});

// GET /metrics/summary
r.get("/summary", async (_req: Request, res: Response) => {
  const [landing, pico] = await Promise.all([
    supabase
      .from("landing_events")
      .select("*", { count: "exact", head: true })
      .eq("type", "landing_view"),
    supabase
      .from("landing_events")
      .select("*", { count: "exact", head: true })
      .eq("type", "pico_placa_use"),
  ]);

  if (landing.error) {
    return res.status(500).json({ error: landing.error.message });
  }
  if (pico.error) {
    return res.status(500).json({ error: pico.error.message });
  }

  return res.json({
    landing_views: landing.count ?? 0,
    pico_placa_uses: pico.count ?? 0,
  });
});

export default r;
