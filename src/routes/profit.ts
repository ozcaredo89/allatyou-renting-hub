// src/routes/profit.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

const SUPABASE_PAGE_SIZE = 1000;

/** Fecha actual en Colombia (UTC-5) en formato YYYY-MM-DD */
function todayCol(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Pagina automáticamente cualquier consulta de Supabase en bloques de 1000 filas
 * para evitar el truncamiento silencioso del límite por defecto de PostgREST.
 * La consulta en `buildQuery` debe incluir un `.order(...)` determinístico.
 */
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + SUPABASE_PAGE_SIZE - 1);
    if (error) return { data: [], error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
    offset += SUPABASE_PAGE_SIZE;
  }
  return { data: all, error: null };
}

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

/** Util: suma días a una fecha YYYY-MM-DD en UTC */
function addDaysYmd(ymd: string, days: number): string {
  const parts = ymd.split("-").map(Number);
  const yy = parts[0] || 1970;
  const mm = parts[1] || 1;
  const dd = parts[2] || 1;
  const d = new Date(Date.UTC(yy, mm - 1, dd + days));
  return d.toISOString().slice(0, 10);
}

/** Util: genera lista de fechas YYYY-MM-DD en [start, endExclusive) */
function listDaysInRange(startYmd: string, endExclusiveYmd: string): string[] {
  const result: string[] = [];
  let cur = startYmd;
  let guard = 0;
  while (cur < endExclusiveYmd && guard < 400) {
    result.push(cur);
    cur = addDaysYmd(cur, 1);
    guard++;
  }
  return result;
}

/**
 * Regla idéntica a la vista SQL `vehicle_month_adjustments` en Supabase:
 * - opening_balance: 0 (un saldo inicial no es utilidad del periodo)
 * - extra_income: +amount
 * - extra_expense: -amount
 * - correction: +amount
 */
function signedLedgerAmount(type: string, amount: any): number {
  const num = Number(amount || 0);
  if (type === "opening_balance") return 0;
  if (type === "extra_expense") return -num;
  if (type === "extra_income" || type === "correction") return num;
  return 0;
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
    .select("plate, status")
    .order("plate", { ascending: true });
  if (vErr) return res.status(500).json({ error: vErr.message });

  const allPlates = (vehicles || []).map(v => v.plate);
  const allStatuses = new Map((vehicles || []).map(v => [v.plate, v.status]));
  const filterPlates = plateFilter ? allPlates.filter(p => p === plateFilter) : allPlates;

  // 2) Monthly profit rows for the month (only for those with activity)
  const { data: vmp, error: mErr } = await supabase
    .from("vehicle_month_profit")
    .select("*")
    .eq("month", monthStart);
  if (mErr) return res.status(500).json({ error: mErr.message });

  const byPlateMonth = new Map<string, any>();
  (vmp || []).forEach(r => byPlateMonth.set(r.plate, r));

  // 3) Cumulative up to month for all plates (paginado para evitar corte en 1000 filas)
  const { data: cumAll, error: cErr } = await fetchAllRows<any>((from, to) =>
    supabase
      .from("vehicle_cumulative_profit")
      .select("*")
      .lte("month", monthStart)
      .order("plate", { ascending: true })
      .order("month", { ascending: true })
      .range(from, to)
  );
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

  // 5) Leasing maintenance fund available (from leasing_contracts_summary_vw)
  const { data: leasingRows, error: lErr } = await supabase
    .from("leasing_contracts_summary_vw")
    .select("plate, maintenance_fund_available, maintenance_fund_accumulated, maintenance_fund_spent");
  if (lErr) return res.status(500).json({ error: lErr.message });
  const leasingMap = new Map<string, any>((leasingRows || []).map(r => [r.plate, r]));

  // Compose items merging vehicles with data (COALESCE to zeros)
  const items = filterPlates.map(plate => {
    const m = byPlateMonth.get(plate) || {};
    const c = lastCum.get(plate);
    const b = breMap.get(plate) || {};
    const l = leasingMap.get(plate);

    const pure_income = Number(m.pure_income || 0);
    const deposits_total = Number(m.deposits_total || 0);
    const advances_total = Number(m.advances_total || 0);
    const maintenance_provision = Number(m.maintenance_provision || 0);
    const maintenance_fund_available = l ? Math.round(Number(l.maintenance_fund_available ?? 0)) : null;
    const expense = Number(m.expense || 0);
    const adjustments = Number(m.adjustments || 0);
    const profit = Number(m.profit || 0);

    return {
      plate,
      status: allStatuses.get(plate) || "active",
      month: monthStart,
      pure_income,
      deposits_total,
      advances_total,
      maintenance_provision,
      maintenance_fund_available,
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
      acc.pure_income += r.pure_income;
      acc.deposits_total += r.deposits_total;
      acc.advances_total += r.advances_total;
      acc.maintenance_provision += r.maintenance_provision;
      if (r.maintenance_fund_available != null) {
        acc.maintenance_fund_available += Number(r.maintenance_fund_available || 0);
      }
      acc.expense += r.expense;
      acc.adjustments += r.adjustments;
      acc.profit += r.profit;
      acc.investment_total += Number(r.investment_total || 0);
      if (r.remaining != null) acc.remaining += Number(r.remaining || 0);
      return acc;
    },
    {
      pure_income: 0,
      deposits_total: 0,
      advances_total: 0,
      maintenance_provision: 0,
      maintenance_fund_available: 0,
      expense: 0,
      adjustments: 0,
      profit: 0,
      investment_total: 0,
      remaining: 0,
    }
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
      pure_income: Number(m.pure_income) || 0,
      deposits_total: Number(m.deposits_total) || 0,
      advances_total: Number(m.advances_total) || 0,
      maintenance_provision: Number(m.maintenance_provision) || 0,
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
 * GET /reports/income-detail?plate=ABC123&month=YYYY-MM (or &from=YYYY-MM-DD&to=YYYY-MM-DD)
 * Payments (confirmed) for that plate in the month or date range.
 */
r.get("/income-detail", async (req: Request, res: Response) => {
  const plate = String(req.query.plate || "").toUpperCase().trim();
  const month = String(req.query.month || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  if (!plate) return res.status(400).json({ error: "plate required" });

  let start: string;
  let end: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    start = from;
    end = addDaysYmd(to, 1);
  } else if (/^\d{4}-\d{2}$/.test(month)) {
    ({ start, end } = monthBounds(month));
  } else {
    return res.status(400).json({ error: "month (YYYY-MM) or from/to (YYYY-MM-DD) required" });
  }

  const { data, error } = await fetchAllRows<any>((fromIdx, toIdx) =>
    supabase
      .from("payments")
      .select("id, payer_name, plate, payment_date, amount, delivery_amount, installment_number, proof_url, status")
      .eq("plate", plate)
      .eq("status", "confirmed")
      .gte("payment_date", start)
      .lt("payment_date", end)
      .order("payment_date", { ascending: true })
      .order("id", { ascending: true })
      .range(fromIdx, toIdx)
  );

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ items: data ?? [] });
});

/**
 * GET /reports/expense-detail?plate=ABC123&month=YYYY-MM (or &from=YYYY-MM-DD&to=YYYY-MM-DD)
 * Prorated expenses (share_amount) for that plate in the month or date range.
 */
r.get("/expense-detail", async (req: Request, res: Response) => {
  const plate = String(req.query.plate || "").toUpperCase().trim();
  const month = String(req.query.month || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  if (!plate) return res.status(400).json({ error: "plate required" });

  let start: string;
  let end: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    start = from;
    end = addDaysYmd(to, 1);
  } else if (/^\d{4}-\d{2}$/.test(month)) {
    ({ start, end } = monthBounds(month));
  } else {
    return res.status(400).json({ error: "month (YYYY-MM) or from/to (YYYY-MM-DD) required" });
  }

  const { data, error } = await fetchAllRows<any>((fromIdx, toIdx) =>
    supabase
      .from("expenses")
      .select("id, date, item, description, attachment_url, expense_vehicles!inner(plate, share_amount)")
      .eq("expense_vehicles.plate", plate)
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(fromIdx, toIdx)
  );

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

/**
 * GET /reports/daily?month=YYYY-MM
 * Daily P&L: desglose financiero día por día del mes.
 * Usa paginación por bloques de 1000 para no truncar meses con >1000 pagos.
 */
r.get("/daily", async (req: Request, res: Response) => {
  const monthStr = String(req.query.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    return res.status(400).json({ error: "month must be YYYY-MM" });
  }

  const { start, end } = monthBounds(monthStr);

  const [paymentsRes, expensesRes] = await Promise.all([
    fetchAllRows<any>((from, to) =>
      supabase
        .from("payments")
        .select("id, payment_date, delivery_amount, insurance_amount, maintenance_amount, credit_installment_amount")
        .eq("status", "confirmed")
        .gte("payment_date", start)
        .lt("payment_date", end)
        .order("payment_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<any>((from, to) =>
      supabase
        .from("expenses")
        .select("id, date, total_amount")
        .gte("date", start)
        .lt("date", end)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  if (paymentsRes.error) return res.status(500).json({ error: paymentsRes.error.message });
  if (expensesRes.error) return res.status(500).json({ error: expensesRes.error.message });

  // Agrupar ingresos por fecha
  const incomeByDay = new Map<string, {
    pure_income: number;
    deposits: number;
    maintenance: number;
    advances: number;
  }>();

  for (const p of paymentsRes.data) {
    const day = p.payment_date;
    const prev = incomeByDay.get(day) || { pure_income: 0, deposits: 0, maintenance: 0, advances: 0 };
    prev.pure_income += Number(p.delivery_amount || 0);
    prev.deposits += Number(p.insurance_amount || 0);
    prev.maintenance += Number(p.maintenance_amount || 0);
    prev.advances += Number(p.credit_installment_amount || 0);
    incomeByDay.set(day, prev);
  }

  // Gastos por día (expenses.total_amount)
  const expenseByDay = new Map<string, number>();
  for (const e of expensesRes.data) {
    const prev = expenseByDay.get(e.date) || 0;
    expenseByDay.set(e.date, prev + Number(e.total_amount || 0));
  }

  // Merge: unir fechas de ambos
  const allDays = new Set([...incomeByDay.keys(), ...expenseByDay.keys()]);
  const items = Array.from(allDays)
    .sort()
    .map(day => {
      const inc = incomeByDay.get(day) || { pure_income: 0, deposits: 0, maintenance: 0, advances: 0 };
      const exp = expenseByDay.get(day) || 0;
      return {
        date: day,
        pure_income: inc.pure_income,
        deposits: inc.deposits,
        advances: inc.advances,
        maintenance: inc.maintenance,
        expense: exp,
        daily_profit: inc.pure_income - exp,
      };
    });

  // Totales del mes
  const totals = items.reduce(
    (acc, r) => {
      acc.pure_income += r.pure_income;
      acc.deposits += r.deposits;
      acc.advances += r.advances;
      acc.maintenance += r.maintenance;
      acc.expense += r.expense;
      acc.daily_profit += r.daily_profit;
      return acc;
    },
    { pure_income: 0, deposits: 0, advances: 0, maintenance: 0, expense: 0, daily_profit: 0 }
  );

  return res.json({ month: monthStr, items, totals });
});

type PlateAccum = {
  pure_income: number;
  expense: number;
  adjustments: number;
};

type SeriesAccum = {
  pure_income: number;
  expense: number;
  adjustments: number;
  active_pure_income: number;
  active_expense: number;
  active_adjustments: number;
};

function emptyPlateAccum(): PlateAccum {
  return { pure_income: 0, expense: 0, adjustments: 0 };
}

function emptySeriesAccum(): SeriesAccum {
  return {
    pure_income: 0,
    expense: 0,
    adjustments: 0,
    active_pure_income: 0,
    active_expense: 0,
    active_adjustments: 0,
  };
}

/**
 * Carga vehículos, estado por placa y fondo de mantenimiento disponible hoy,
 * e inicializa los acumuladores por placa para las placas filtradas.
 */
async function loadFleetContext(plateFilter: string) {
  const [vehiclesRes, leasingRes] = await Promise.all([
    supabase.from("vehicles").select("plate, status").order("plate", { ascending: true }),
    supabase.from("leasing_contracts_summary_vw").select("plate, maintenance_fund_available"),
  ]);

  if (vehiclesRes.error) return { error: vehiclesRes.error.message, ctx: null };
  if (leasingRes.error) return { error: leasingRes.error.message, ctx: null };

  const vehicles = vehiclesRes.data || [];
  const allPlates = vehicles.map(v => v.plate);
  const statusByPlate = new Map<string, string>(
    vehicles.map(v => [v.plate, v.status || "active"])
  );
  const isInactivePlate = (p: string) => {
    const st = statusByPlate.get(p);
    return st === "sold" || st === "inactive";
  };

  const leasingMap = new Map<string, number>();
  for (const row of leasingRes.data || []) {
    leasingMap.set(row.plate, Math.round(Number(row.maintenance_fund_available ?? 0)));
  }

  const filterPlates = plateFilter ? allPlates.filter(p => p === plateFilter) : allPlates;
  const filterPlateSet = new Set(filterPlates);

  const plateStats = new Map<string, PlateAccum>();
  for (const p of filterPlates) {
    plateStats.set(p, emptyPlateAccum());
  }

  return {
    error: null,
    ctx: {
      filterPlates,
      filterPlateSet,
      statusByPlate,
      isInactivePlate,
      leasingMap,
      plateStats,
    },
  };
}

function buildProfitabilityItems(
  filterPlates: string[],
  plateStats: Map<string, PlateAccum>,
  statusByPlate: Map<string, string>,
  leasingMap: Map<string, number>
) {
  return filterPlates.map(plate => {
    const st = plateStats.get(plate) || emptyPlateAccum();
    const pure_income = Math.round(st.pure_income);
    const expense = Math.round(st.expense);
    const adjustments = Math.round(st.adjustments);
    const net_profit = pure_income - expense + adjustments;
    const maintenance_fund_available = leasingMap.has(plate) ? leasingMap.get(plate)! : null;

    return {
      plate,
      status: statusByPlate.get(plate) || "active",
      maintenance_fund_available,
      pure_income,
      expense,
      adjustments,
      net_profit,
    };
  });
}

function buildProfitabilitySeries(keys: string[], bucketStats: Map<string, SeriesAccum>) {
  return keys.map(date => {
    const bs = bucketStats.get(date) || emptySeriesAccum();
    const pure_income = Math.round(bs.pure_income);
    const expense = Math.round(bs.expense);
    const adjustments = Math.round(bs.adjustments);
    const net_profit = pure_income - expense + adjustments;

    const active_pure_income = Math.round(bs.active_pure_income);
    const active_expense = Math.round(bs.active_expense);
    const active_adjustments = Math.round(bs.active_adjustments);
    const active_net_profit = active_pure_income - active_expense + active_adjustments;

    return {
      date,
      pure_income,
      expense,
      adjustments,
      net_profit,
      active_pure_income,
      active_expense,
      active_adjustments,
      active_net_profit,
    };
  });
}

function buildProfitabilityTotals(items: ReturnType<typeof buildProfitabilityItems>) {
  return items.reduce(
    (acc, r) => {
      acc.pure_income += r.pure_income;
      acc.expense += r.expense;
      acc.adjustments += r.adjustments;
      acc.net_profit += r.net_profit;
      if (r.maintenance_fund_available != null) {
        acc.maintenance_fund_available += r.maintenance_fund_available;
      }
      return acc;
    },
    { pure_income: 0, expense: 0, adjustments: 0, net_profit: 0, maintenance_fund_available: 0 }
  );
}

/**
 * GET /reports/profitability?period=day|week|month|year&date=YYYY-MM-DD&month=YYYY-MM&year=YYYY&plate=ABC123
 * Tab de Rentabilidad:
 * - Ventana de tiempo rápida:
 *   • day: tabla desglosa el día seleccionado (date); gráfico muestra los 7 días hasta date para visualizar la tendencia.
 *   • week: últimos 7 días hasta date (inclusive) tanto en gráfico como en tabla.
 *   • month: mes seleccionado (month = YYYY-MM) tanto en gráfico como en tabla.
 *     Si el mes consultado es el mes en curso en Colombia, la serie del gráfico se corta en todayCol()
 *     para no graficar días futuros en $0.
 *   • year: año seleccionado (year = YYYY), usando la vista SQL `vehicle_month_profit`.
 *     La serie del gráfico muestra la evolución mensual (YYYY-01..YYYY-12) y, si es el año en curso,
 *     se corta en el mes actual en Colombia para no graficar meses futuros en $0.
 * - Fórmula contable (idéntica a vehicle_month_profit / vehicle_month_adjustments):
 *   Ingresos = pure_income (delivery_amount), Gastos = share_amount en expense_vehicles,
 *   Ajustes = vehicle_ledger (extra_income: +amount, extra_expense: -amount, correction: +amount, opening_balance: 0),
 *   Rentabilidad Neta = Ingresos - Gastos + Ajustes.
 */
r.get("/profitability", async (req: Request, res: Response) => {
  const periodRaw = String(req.query.period || "month").trim().toLowerCase();
  const period: "day" | "week" | "month" | "year" =
    periodRaw === "day" || periodRaw === "week" || periodRaw === "year" ? periodRaw : "month";

  const currentDayCol = todayCol();
  const currentYearCol = currentDayCol.slice(0, 4);
  const dateParam = String(req.query.date || currentDayCol).trim();
  const monthParam = String(req.query.month || dateParam.slice(0, 7)).trim();
  const yearParam = String(req.query.year || monthParam.slice(0, 4) || currentYearCol).trim();
  const plateFilter = String(req.query.plate || "").toUpperCase().trim();

  if (period === "year") {
    const yearNum = Number(yearParam);
    const maxAllowedYear = Number(currentYearCol) + 1;
    if (!/^\d{4}$/.test(yearParam) || yearNum < 2000 || yearNum > maxAllowedYear) {
      return res
        .status(400)
        .json({ error: `year must be YYYY between 2000 and ${maxAllowedYear}` });
    }

    const yearStartMonth = `${yearParam}-01-01`;
    const yearEndMonth = `${yearParam}-12-01`;

    const [fleetRes, vmpRes] = await Promise.all([
      loadFleetContext(plateFilter),
      fetchAllRows<any>((from, to) =>
        supabase
          .from("vehicle_month_profit")
          .select("plate, month, pure_income, expense, adjustments, profit")
          .gte("month", yearStartMonth)
          .lte("month", yearEndMonth)
          .order("month", { ascending: true })
          .order("plate", { ascending: true })
          .range(from, to)
      ),
    ]);

    if (fleetRes.error || !fleetRes.ctx) {
      return res.status(500).json({ error: fleetRes.error || "Failed to load fleet context" });
    }
    if (vmpRes.error) return res.status(500).json({ error: vmpRes.error.message });

    const { filterPlates, filterPlateSet, statusByPlate, isInactivePlate, leasingMap, plateStats } =
      fleetRes.ctx;

    // Si es el año actual en Colombia, cortamos la serie del gráfico en el mes actual (inclusive)
    // para que los meses futuros aún no transcurridos no caigan a $0 al final de la gráfica.
    const currentMonthNum = Number(currentDayCol.slice(5, 7));
    const maxMonth = yearParam === currentYearCol ? currentMonthNum : 12;

    const chartMonths: string[] = [];
    const monthStats = new Map<string, SeriesAccum>();
    for (let m = 1; m <= maxMonth; m++) {
      const ym = `${yearParam}-${String(m).padStart(2, "0")}`;
      chartMonths.push(ym);
      monthStats.set(ym, emptySeriesAccum());
    }

    for (const row of vmpRes.data) {
      if (!row.plate || !filterPlateSet.has(row.plate)) continue;
      const inc = Number(row.pure_income || 0);
      const exp = Number(row.expense || 0);
      const adj = Number(row.adjustments || 0);
      const ym = String(row.month || "").slice(0, 7);

      const st = plateStats.get(row.plate);
      if (st) {
        st.pure_income += inc;
        st.expense += exp;
        st.adjustments += adj;
      }

      const ms = monthStats.get(ym);
      if (ms) {
        ms.pure_income += inc;
        ms.expense += exp;
        ms.adjustments += adj;
        if (!isInactivePlate(row.plate)) {
          ms.active_pure_income += inc;
          ms.active_expense += exp;
          ms.active_adjustments += adj;
        }
      }
    }

    const items = buildProfitabilityItems(filterPlates, plateStats, statusByPlate, leasingMap);
    const series = buildProfitabilitySeries(chartMonths, monthStats);
    const totals = buildProfitabilityTotals(items);

    const lastChartMonth = chartMonths[chartMonths.length - 1] || `${yearParam}-12`;
    const lastChartBounds = monthBounds(lastChartMonth);

    return res.json({
      period,
      start_date: `${yearParam}-01-01`,
      end_date: `${yearParam}-12-31`,
      chart_start_date: `${yearParam}-01-01`,
      chart_end_date: addDaysYmd(lastChartBounds.end, -1),
      series,
      items,
      totals,
    });
  }

  if (period === "month") {
    if (!/^\d{4}-\d{2}$/.test(monthParam)) {
      return res.status(400).json({ error: "month must be YYYY-MM" });
    }
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }
  }

  let tableStart: string;
  let tableEndExclusive: string;
  let chartStart: string;
  let chartEndExclusive: string;

  if (period === "day") {
    tableStart = dateParam;
    tableEndExclusive = addDaysYmd(dateParam, 1);
    // Para el gráfico de tendencia en vista de día, mostramos los 7 días que terminan en dateParam
    chartStart = addDaysYmd(dateParam, -6);
    chartEndExclusive = tableEndExclusive;
  } else if (period === "week") {
    tableStart = addDaysYmd(dateParam, -6);
    tableEndExclusive = addDaysYmd(dateParam, 1);
    chartStart = tableStart;
    chartEndExclusive = tableEndExclusive;
  } else {
    const bounds = monthBounds(monthParam);
    tableStart = bounds.start;
    tableEndExclusive = bounds.end;
    chartStart = bounds.start;
    // Si es el mes actual (o futuro), cortamos la serie del gráfico en hoy (inclusive)
    // para que los días futuros aún no transcurridos no caigan a $0 al final de la gráfica.
    const tomorrowCol = addDaysYmd(currentDayCol, 1);
    chartEndExclusive =
      monthParam === currentDayCol.slice(0, 7) && tomorrowCol < bounds.end
        ? tomorrowCol
        : bounds.end;
  }

  const queryStart = chartStart < tableStart ? chartStart : tableStart;
  const queryEnd = chartEndExclusive > tableEndExclusive ? chartEndExclusive : tableEndExclusive;

  const [fleetRes, paymentsRes, expensesRes, ledgerRes] = await Promise.all([
    loadFleetContext(plateFilter),
    fetchAllRows<any>((from, to) =>
      supabase
        .from("payments")
        .select("id, plate, payment_date, delivery_amount")
        .eq("status", "confirmed")
        .gte("payment_date", queryStart)
        .lt("payment_date", queryEnd)
        .order("payment_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<any>((from, to) =>
      supabase
        .from("expenses")
        .select("id, date, expense_vehicles(plate, share_amount)")
        .gte("date", queryStart)
        .lt("date", queryEnd)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<any>((from, to) =>
      supabase
        .from("vehicle_ledger")
        .select("id, plate, date, type, amount")
        .gte("date", queryStart)
        .lt("date", queryEnd)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  if (fleetRes.error || !fleetRes.ctx) {
    return res.status(500).json({ error: fleetRes.error || "Failed to load fleet context" });
  }
  if (paymentsRes.error) return res.status(500).json({ error: paymentsRes.error.message });
  if (expensesRes.error) return res.status(500).json({ error: expensesRes.error.message });
  if (ledgerRes.error) return res.status(500).json({ error: ledgerRes.error.message });

  const { filterPlates, filterPlateSet, statusByPlate, isInactivePlate, leasingMap, plateStats } =
    fleetRes.ctx;

  // Acumuladores por día para el gráfico [chartStart, chartEndExclusive)
  const chartDays = listDaysInRange(chartStart, chartEndExclusive);
  const dayStats = new Map<string, SeriesAccum>();
  for (const d of chartDays) {
    dayStats.set(d, emptySeriesAccum());
  }

  // 1) Procesar ingresos (payments.delivery_amount)
  for (const p of paymentsRes.data) {
    if (!p.plate || !filterPlateSet.has(p.plate)) continue;
    const val = Number(p.delivery_amount || 0);
    const d = p.payment_date;

    if (d >= tableStart && d < tableEndExclusive) {
      const st = plateStats.get(p.plate);
      if (st) st.pure_income += val;
    }
    if (d >= chartStart && d < chartEndExclusive) {
      const ds = dayStats.get(d);
      if (ds) {
        ds.pure_income += val;
        if (!isInactivePlate(p.plate)) ds.active_pure_income += val;
      }
    }
  }

  // 2) Procesar gastos prorrateados por vehículo (expense_vehicles.share_amount)
  for (const exp of expensesRes.data) {
    const d = exp.date;
    const evList = (exp.expense_vehicles as any[]) || [];
    for (const ev of evList) {
      if (!ev.plate || !filterPlateSet.has(ev.plate)) continue;
      const val = Number(ev.share_amount || 0);

      if (d >= tableStart && d < tableEndExclusive) {
        const st = plateStats.get(ev.plate);
        if (st) st.expense += val;
      }
      if (d >= chartStart && d < chartEndExclusive) {
        const ds = dayStats.get(d);
        if (ds) {
          ds.expense += val;
          if (!isInactivePlate(ev.plate)) ds.active_expense += val;
        }
      }
    }
  }

  // 3) Procesar ajustes contables (vehicle_ledger con la misma regla de vehicle_month_adjustments)
  for (const l of ledgerRes.data) {
    if (!l.plate || !filterPlateSet.has(l.plate)) continue;
    const val = signedLedgerAmount(l.type, l.amount);
    if (val === 0) continue;
    const d = l.date;

    if (d >= tableStart && d < tableEndExclusive) {
      const st = plateStats.get(l.plate);
      if (st) st.adjustments += val;
    }
    if (d >= chartStart && d < chartEndExclusive) {
      const ds = dayStats.get(d);
      if (ds) {
        ds.adjustments += val;
        if (!isInactivePlate(l.plate)) ds.active_adjustments += val;
      }
    }
  }

  const items = buildProfitabilityItems(filterPlates, plateStats, statusByPlate, leasingMap);
  const series = buildProfitabilitySeries(chartDays, dayStats);
  const totals = buildProfitabilityTotals(items);

  return res.json({
    period,
    start_date: tableStart,
    end_date: addDaysYmd(tableEndExclusive, -1),
    chart_start_date: chartStart,
    chart_end_date: addDaysYmd(chartEndExclusive, -1),
    series,
    items,
    totals,
  });
});

export default r;
