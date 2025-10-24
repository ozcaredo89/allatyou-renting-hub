// src/routes/profit.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/** Util: monthStart (YYYY-MM) -> { start: YYYY-MM-01, end: next month YYYY-MM-01 } */
function monthBounds(monthStr: string) {
  // monthStr viene validado como YYYY-MM
  const [yy, mm] = monthStr.split("-") as [string, string];
  const y = parseInt(yy, 10);
  const m = parseInt(mm, 10); // 1..12

  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    throw new Error("Invalid month string");
  }

  // start = YYYY-MM-01 (mes actual), end = primer día del mes siguiente (exclusivo)
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // OK: Date.UTC(year, monthIndex 0..11, day)

  const toYmd = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toYmd(start), end: toYmd(end) };
}

/**
 * GET /reports/profit?month=YYYY-MM&plate=ABC123
 * List monthly profit per vehicle (INCLUDES vehicles with zero activity).
 */
r.get("/profit", async (req: Request, res: Response) => {
  const monthStr = String(req.query.month || "").trim();
  const plateFilter = String(req.query.plate || "").toUpperCase().trim();

  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    return res.status(400).json({ error: "month must be YYYY-MM" });
  }
  const monthStart = `${monthStr}-01`;

  // 1) Get all vehicles (ensures rows even when 0 activity)
  const { data: vehicles, error: vErr } = await supabase
    .from("vehicles")
    .select("plate")
    .order("plate", { ascending: true });
  if (vErr) return res.status(500).json({ error: vErr.message });

  const allPlates = (vehicles || []).map(v => v.plate);
  const filterPlates = plateFilter ? allPlates.filter(p => p === plateFilter) : allPlates;

  // 2) Monthly profit rows for the month (only for those with activity)
  const { data: vmp, error: mErr } = await supabase
    .from("vehicle_month_profit")
    .select("*")
    .eq("month", monthStart);
  if (mErr) return res.status(500).json({ error: mErr.message });

  const byPlateMonth = new Map<string, any>();
  (vmp || []).forEach(r => byPlateMonth.set(r.plate, r));

  // 3) Cumulative up to month for all plates
  const { data: cumAll, error: cErr } = await supabase
    .from("vehicle_cumulative_profit")
    .select("*")
    .lte("month", monthStart);
  if (cErr) return res.status(500).json({ error: cErr.message });

  const lastCum = new Map<string, any>();
  (cumAll || []).forEach(r => {
    const prev = lastCum.get(r.plate);
    if (!prev || prev.month < r.month) lastCum.set(r.plate, r);
  });

  // 4) Investment/breakeven for all plates
  const { data: bre, error: bErr } = await supabase
    .from("vehicle_breakeven_status")
    .select("*");
  if (bErr) return res.status(500).json({ error: bErr.message });
  const breMap = new Map<string, any>((bre || []).map(r => [r.plate, r]));

  // Compose items merging vehicles with data (COALESCE to zeros)
  const items = filterPlates.map(plate => {
    const m = byPlateMonth.get(plate) || {};
    const c = lastCum.get(plate);
    const b = breMap.get(plate) || {};

    const income = Number(m.income || 0);
    const expense = Number(m.expense || 0);
    const adjustments = Number(m.adjustments || 0);
    const profit = Number(m.profit || 0);

    return {
      plate,
      month: monthStart,
      income,
      expense,
      adjustments,
      profit,
      cum_profit: c ? Number(c.cum_profit || 0) : 0,
      investment_total: b.investment_total ?? 0,
      remaining: b.remaining ?? null,
      pct_recovered: b.pct_recovered ?? null,
      is_released: !!b.is_released,
    };
  });

  const totals = items.reduce(
    (acc, r) => {
      acc.income += r.income;
      acc.expense += r.expense;
      acc.adjustments += r.adjustments;
      acc.profit += r.profit;
      acc.investment_total += Number(r.investment_total || 0);
      if (r.remaining != null) acc.remaining += Number(r.remaining || 0);
      return acc;
    },
    { income: 0, expense: 0, adjustments: 0, profit: 0, investment_total: 0, remaining: 0 }
  );

  return res.json({ month: monthStr, items, totals });
});

/**
 * GET /reports/profit/series?plate=ABC123&from=YYYY-MM&to=YYYY-MM
 * Monthly time series for a plate.
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

  const { data: inv, error: invErr } = await supabase
    .from("vehicle_investment_total")
    .select("*")
    .eq("plate", plate)
    .single();
  if (invErr && invErr.code !== "PGRST116") {
    return res.status(500).json({ error: invErr.message });
  }
  const investment_total = inv?.investment_total ?? 0;

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
});

/**
 * NEW: GET /reports/income-detail?plate=ABC123&month=YYYY-MM
 * Payments (confirmed) for that plate in the month.
 */
r.get("/income-detail", async (req: Request, res: Response) => {
  const plate = String(req.query.plate || "").toUpperCase().trim();
  const month = String(req.query.month || "").trim();
  if (!plate) return res.status(400).json({ error: "plate required" });
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });

  const { start, end } = monthBounds(month);

  const { data, error } = await supabase
    .from("payments")
    .select("id, payer_name, plate, payment_date, amount, installment_number, proof_url, status")
    .eq("plate", plate)
    .eq("status", "confirmed")
    .gte("payment_date", start)
    .lt("payment_date", end)
    .order("payment_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ items: data ?? [] });
});

/**
 * NEW: GET /reports/expense-detail?plate=ABC123&month=YYYY-MM
 * Prorated expenses (share_amount) for that plate in the month.
 */
r.get("/expense-detail", async (req: Request, res: Response) => {
  const plate = String(req.query.plate || "").toUpperCase().trim();
  const month = String(req.query.month || "").trim();
  if (!plate) return res.status(400).json({ error: "plate required" });
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });

  const { start, end } = monthBounds(month);

  const { data, error } = await supabase
    .from("expenses")
    .select("id, date, item, description, attachment_url, expense_vehicles!inner(plate, share_amount)")
    .eq("expense_vehicles.plate", plate)
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: true })
    .order("id", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Flatten for convenience
  const items = (data || []).map(row => ({
    id: row.id,
    date: row.date,
    item: row.item,
    description: row.description,
    attachment_url: row.attachment_url,
    share_amount: (row as any).expense_vehicles?.[0]?.share_amount ?? 0,
  }));

  return res.json({ items });
});

export default r;
