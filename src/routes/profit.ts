// src/routes/profit.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /reports/profit?month=YYYY-MM&plate=ABC123
 * Devuelve utilidad del mes + acumulado + inversión/remaining por vehículo,
 * y agregados (totales) al final.
 */
r.get("/profit", async (req: Request, res: Response) => {
  const monthStr = String(req.query.month || "").trim(); // "2025-10"
  const plate = String(req.query.plate || "").toUpperCase().trim();

  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    return res.status(400).json({ error: "month must be YYYY-MM" });
  }
  const monthStart = `${monthStr}-01`;
  // monthEnd = primer día del mes siguiente (exclusivo) — lo usamos solo si hiciera falta

  // 1) Traer profit mensual (vmp) del mes pedido
  let q = supabase
    .from("vehicle_month_profit")
    .select("*")
    .eq("month", monthStart)
    .order("plate", { ascending: true });

  if (plate) q = q.eq("plate", plate);

  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // 2) Para cada plate, traer el acumulado hasta ese mes y la inversión total/remaining
  const plates = (rows || []).map(r => r.plate);
  const uniquePlates = Array.from(new Set(plates));

  // cumulative up to this month
  let qc = supabase
    .from("vehicle_cumulative_profit")
    .select("*")
    .lte("month", monthStart)
    .in("plate", uniquePlates);

  const { data: cumAll, error: cumErr } = await qc;
  if (cumErr) return res.status(500).json({ error: cumErr.message });

  // tomar el último registro de cada plate (mes <= seleccionado)
  const lastCum = new Map<string, any>();
  (cumAll || []).forEach((r) => {
    const k = r.plate;
    const prev = lastCum.get(k);
    if (!prev || prev.month < r.month) lastCum.set(k, r);
  });

  // investment + remaining
  let qi = supabase
    .from("vehicle_breakeven_status")
    .select("*")
    .in("plate", uniquePlates);

  const { data: brAll, error: brErr } = await qi;
  if (brErr) return res.status(500).json({ error: brErr.message });
  const byPlate = new Map<string, any>((brAll || []).map(r => [r.plate, r]));

  // Compose response rows
  const items = (rows || []).map(r => {
    const c = lastCum.get(r.plate);
    const b = byPlate.get(r.plate) || {};
    return {
      plate: r.plate,
      month: r.month,                 // YYYY-MM-01
      income: Number(r.income) || 0,
      expense: Number(r.expense) || 0,
      adjustments: Number(r.adjustments) || 0,
      profit: Number(r.profit) || 0,
      cum_profit: c ? Number(c.cum_profit) : 0,
      investment_total: b.investment_total ?? 0,
      remaining: b.remaining ?? null,
      pct_recovered: b.pct_recovered ?? null,
      is_released: !!b.is_released,
    };
  });

  // Totales agregados del mes
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
});

/**
 * GET /reports/profit/series?plate=ABC123&from=YYYY-MM&to=YYYY-MM
 * Serie mensual (income/expense/adjustments/profit + cum/investment/remaining).
 */
r.get("/profit/series", async (req: Request, res: Response) => {
  const plate = String(req.query.plate || "").toUpperCase().trim();
  const from = String(req.query.from || "").trim();
  const to   = String(req.query.to || "").trim();

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

  // investment total
  const { data: inv, error: invErr } = await supabase
    .from("vehicle_investment_total")
    .select("*")
    .eq("plate", plate)
    .single();
  if (invErr && invErr.code !== "PGRST116") { // not found is ok
    return res.status(500).json({ error: invErr.message });
  }
  const investment_total = inv?.investment_total ?? 0;

  // build cum_profit
  let cum = 0;
  const series = (monthly || []).map(m => {
    cum += Number(m.profit) || 0;
    const remaining = Math.max(investment_total - cum, 0);
    return {
      plate,
      month: m.month,
      income: Number(m.income) || 0,
      expense: Number(m.expense) || 0,
      adjustments: Number(m.adjustments) || 0,
      profit: Number(m.profit) || 0,
      cum_profit: cum,
      investment_total,
      remaining
    };
  });

  return res.json({ plate, from, to, series });
});

export default r;
