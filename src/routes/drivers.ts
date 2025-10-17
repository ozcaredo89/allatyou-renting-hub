import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/** Devuelve datos del conductor por placa. */
r.get("/:plate", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase();

  // formato COL autos: ABC123
  const PLATE_RE = /^[A-Z]{3}\d{3}$/;
  if (!PLATE_RE.test(plate)) {
    return res.status(400).json({ error: "invalid plate format (ABC123)" });
  }

  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("plate", plate)
    .single();

  if (error && error.code !== "PGRST116") {
    return res.status(500).json({ error: error.message });
  }

  // Respuesta uniforme
  if (!data) return res.json({ found: false });
  return res.json({
    found: true,
    driver: {
      plate: data.plate,
      driver_name: data.driver_name,
      has_credit: data.has_credit,
      default_amount: data.default_amount,
      default_installment: data.default_installment,
    },
  });
});

export default r;
