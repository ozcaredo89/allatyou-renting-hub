// src/routes/profit.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /reports/profit?month=YYYY-MM&plate=ABC123
 * - Muestra utilidad del mes por vehículo.
 * - Incluye acumulado hasta ese mes y estado de inversión/remaining.
 * - Importante: usa vehicles como base (left-merge) para incluir placas sin movimiento.
 */
r.get("/profit", async (req: Request, res: Response) => {
  try {
    const monthStr = String(req.query.month || "").trim(); // "2025-10"
    const plate    = String(req.query.plate || "").toUpperCase().trim();

    if (!/^\d{4}-\d{2}$/.test(monthStr)) {
      return res.status(400).json({ error: "month must be YYYY-MM" });
    }
    const monthStart = `${monthStr}-01`;

    // 0) Base: TODAS las placas desde vehicles (filtra por plate si viene)
    const { data: vlist, error: vErr } = await supabase
      .from("vehicles")
      .select("plate")
      .order("plate", { ascending: true });

    if (vErr) return res.status(500).json({ error: vErr.message });

    const basePlates = (vlist || [])
      .map(r => r.plate)
      .filter(p => (plate ? p === plate : true));

    if (basePlates.length === 0) {
      return res.json({
        month: monthStr,
        items: [],
        totals: { income: 0, expense: 0, adjustments: 0, profit: 0, investment_total: 0, remaining: 0 },
      });
    }

    // 1) Profit del mes solo para placas base
    const { data: vmp, error: vmpErr } = await supabase
      .from("vehicle_month_profit")
      .select("*")
      .eq("month", monthStart)
      .in("plate", basePlates);

    if (vmpErr) return res.status(500).json({ error: vmpErr.message });

    const byVmp = new Map<string, any>((vmp || []).map(r => [r.plate, r]));

    // 2) Acumulado hasta el mes (para TODAS las placas base)
    const { data: cumAll, error: cumErr } = await supabase
      .from("vehicle_cumulative_profit")
      .select("*")
      .lte("month", monthStart)
      .in("plate", basePlates);

    if (cumErr) return res.status(500).json({ error: cumErr.message });

    const lastCum = new Map<string, any>();
    (cumAll || []).forEach((r) => {
      const k = r.plate;
      const prev = lastCum.get(k);
      if (!prev || prev.month < r.month) lastCum.set(k, r);
    });

    // 3) Estado de inversión / remaining (para TODAS las placas base)
    const { data: brAll, error: brErr } = await supabase
      .from("vehicle_breakeven_status")
      .select("*")
      .in("plate", basePlates);

    if (brErr) return res.status(500).json({ error: brErr.message });
    const byPlateBRE = new Map<string, any>((brAll || []).map(r => [r.plate, r]));

    // 4) Componer filas (una por cada placa base)
    const items = basePlates.map(p => {
      const m = byVmp.get(p) || { plate: p, month: monthStart, income: 0, expense: 0, adjustments: 0, profit: 0 };
      const c = lastCum.get(p);
      const b = byPlateBRE.get(p) || {};
      return {
        plate: p,
        month: m.month,
        income: Number(m.income) || 0,
        expense: Number(m.expense) || 0,
        adjustments: Number(m.adjustments) || 0,
        profit: Number(m.profit) || 0,
        cum_profit: c ? Number(c.cum_profit) : 0,
        investment_total: b.investment_total ?? 0,
        remaining: b.remaining ?? null,
        pct_recovered: b.pct_recovered ?? null,
        is_released: !!b.is_released,
      };
    });

    // 5) Totales del mes
    const totals = items.reduce(
      (acc, r) => {
        acc.income += r.income;
        acc.expense += r.expense;
        acc.adjustments += r.adjustments;
        acc.profit += r.profit;
        acc.investment_total += Number(r.investment_total || 0);
        acc.remaining += Number(r.remaining || 0);
        return acc;
      },
      { income: 0, expense: 0, adjustments: 0, profit: 0, investment_total: 0, remaining: 0 }
    );

    return res.json({ month: monthStr, items, totals });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

/**
 * GET /reports/profit/series?plate=ABC123&from=YYYY-MM&to=YYYY-MM
 * Serie mensual por placa (income/expense/adjustments/profit + cumulativo e inversión).
 */
r.get("/profit/series", async (req: Request, res: Response) => {
  try {
    const plate = String(req.query.plate || "").toUpperCase().trim();
    const from  = String(req.query.from || "").trim();
    const to    = String(req.query.to || "").trim();

    if (!plate) return res.status(400).json({ error: "plate required" });
    if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: "from/to must be YYYY-MM" });
    }
    const fromDate = `${from}-01`;
    const toDate   = `${to}-01`;

    const { data: monthly, error } = await supabase
      .from("vehicle_month_profit")
      .select("*")
      .eq("plate", plate)
      .gte("month", fromDate)
      .lte("month", toDate)
      .order("month", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // inversión total
    const { data: inv, error: invErr } = await supabase
      .from("vehicle_investment_total")
      .select("*")
      .eq("plate", plate)
      .single();

    // PGRST116 = not found (ok → inversión 0)
    if (invErr && (invErr as any).code !== "PGRST116") {
      return res.status(500).json({ error: invErr.message });
    }
    const investment_total = inv?.investment_total ?? 0;

    // serie con acumulado
    let cum = 0;
    const series = (monthly || []).map(m => {
      const profit = Number(m.profit) || 0;
      cum += profit;
      const remaining = Math.max(investment_total - cum, 0);
      return {
        plate,
        month: m.month,
        income: Number(m.income) || 0,
        expense: Number(m.expense) || 0,
        adjustments: Number(m.adjustments) || 0,
        profit,
        cum_profit: cum,
        investment_total,
        remaining
      };
    });

    return res.json({ plate, from, to, series });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

export default r;
