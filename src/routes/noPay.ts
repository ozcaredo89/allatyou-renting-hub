import { Router, Request, Response } from "express";
import { isNoPayDay, nextPayableDate } from "../lib/noPay";

const r = Router();

/** GET /no-pay/check?plate=ABC123&date=YYYY-MM-DD */
r.get("/check", async (req: Request, res: Response) => {
  try {
    const plate = String(req.query.plate || "").toUpperCase().trim();
    const date  = String(req.query.date || "").trim();

    if (!plate) return res.status(400).json({ error: "plate required" });
    if (!/^[A-Z]{3}\d{3}$/.test(plate)) return res.status(400).json({ error: "invalid plate format" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

    // 1. Verificamos si tiene restricción
    const checkResult: any = await isNoPayDay(plate, date, "Cali");

    // 2. LÓGICA DE REFUERZO: Si hay restricción, calculamos la sugerencia
    if (checkResult && checkResult.noPay) {
        try {
            // includeFrom = false para que busque desde el día siguiente
            const next: any = await nextPayableDate(plate, date, false, "Cali");
            
            // CORRECCIÓN AQUÍ: Usamos .nextDate en lugar de .date
            const nextDateStr = typeof next === 'string' ? next : next?.nextDate;
            
            if (nextDateStr) {
                checkResult.suggestedDate = nextDateStr;
            }
        } catch (err) {
            console.error("Error calculando sugerencia automática:", err);
        }
    }

    return res.json(checkResult);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "internal error" });
  }
});

/** GET /no-pay/next-date?plate=ABC123&from=YYYY-MM-DD&includeFrom=true */
r.get("/next-date", async (req: Request, res: Response) => {
  try {
    const plate = String(req.query.plate || "").toUpperCase().trim();
    const from  = String(req.query.from || "").trim();
    const includeFrom = String(req.query.includeFrom || "false").toLowerCase() === "true";

    if (!plate) return res.status(400).json({ error: "plate required" });
    if (!/^[A-Z]{3}\d{3}$/.test(plate)) return res.status(400).json({ error: "invalid plate format" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return res.status(400).json({ error: "from must be YYYY-MM-DD" });

    const ans = await nextPayableDate(plate, from, includeFrom, "Cali");
    return res.json(ans);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "internal error" });
  }
});

export default r;