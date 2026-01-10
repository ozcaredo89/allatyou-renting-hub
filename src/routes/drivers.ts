// src/routes/drivers.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

const PLATE_RE = /^[A-Z]{3}\d{3}$/;

/** Devuelve datos del conductor por placa (para pagos/autocompletar). */
r.get("/:plate", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase().trim();

  if (!PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "invalid plate format (ABC123)" });
  }

  // IMPORTANTE: la fuente actual es la VIEW legacy
  // (antes era public.drivers; ahora es public.drivers_vw)
  const { data, error } = await supabase
    .from("drivers_vw")
    .select("plate, driver_name, has_credit, default_amount, default_installment")
    .eq("plate", plate)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) return res.status(404).json({ found: false });

  return res.json({
    found: true,
    driver: {
      plate: data.plate,
      driver_name: data.driver_name,
      has_credit: Boolean(data.has_credit),
      default_amount: data.default_amount ?? null,
      default_installment: data.default_installment ?? null,
    },
  });
});

export default r;
