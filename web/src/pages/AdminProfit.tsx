import { useEffect, useRef, useState } from "react";
import { requestWithBasicAuth, clearBasicAuth } from "../lib/auth";
import CompanyLock from "../components/CompanyLock";
import { ArrowUp, ArrowDown, ChevronsUpDown, TrendingUp } from "lucide-react";
import { useSortableData } from "../hooks/useSortableData";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

/** Primer año con registros históricos en el sistema para el selector anual */
const FIRST_DATA_YEAR = 2022;

/** Fecha actual en Colombia (UTC-5) en formato YYYY-MM-DD */
function todayCol(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

type VehicleStatus = "active" | "maintenance" | "sold" | "inactive" | "leasing" | "reserved";

type ProfitRow = {
  plate: string;
  status?: VehicleStatus;
  month: string;
  pure_income: number;
  deposits_total: number;
  advances_total: number;
  maintenance_provision: number;
  maintenance_fund_available?: number | null;
  expense: number;
  adjustments: number;
  profit: number;
  cum_profit: number;
  investment_total: number | null;
  remaining: number | null;
  pct_recovered: number | null;
  is_released: boolean;
};

type ProfitResp = {
  month: string;
  items: ProfitRow[];
  totals: {
    pure_income: number;
    deposits_total: number;
    advances_total: number;
    maintenance_provision: number;
    maintenance_fund_available: number;
    expense: number;
    adjustments: number;
    profit: number;
    investment_total: number;
    remaining: number;
  };
};

type PaymentDetail = {
  id: number;
  payer_name: string;
  plate: string;
  payment_date: string;
  amount: number;
  delivery_amount?: number;
  installment_number: number | null;
  proof_url: string | null;
  status: "pending" | "confirmed" | "rejected";
};

type ExpenseDetail = {
  id: number;
  date: string;
  item: string;
  description: string | null;
  attachment_url: string | null;
  share_amount: number;
};

type LedgerRow = {
  id: number;
  plate: string;
  date: string; // YYYY-MM-DD
  type: "opening_balance" | "extra_income" | "extra_expense" | "correction";
  amount: number;
  description: string | null;
  attachment_url: string | null;
};

type DailyRow = {
  date: string;
  pure_income: number;
  deposits: number;
  advances: number;
  maintenance: number;
  expense: number;
  daily_profit: number;
};

type DailyResp = {
  month: string;
  items: DailyRow[];
  totals: {
    pure_income: number;
    deposits: number;
    advances: number;
    maintenance: number;
    expense: number;
    daily_profit: number;
  };
};

type ProfitabilityPeriod = "day" | "week" | "month" | "year";

type ProfitabilitySeriesPoint = {
  date: string;
  pure_income: number;
  expense: number;
  adjustments: number;
  net_profit: number;
  active_pure_income: number;
  active_expense: number;
  active_adjustments: number;
  active_net_profit: number;
};

type ProfitabilityRow = {
  plate: string;
  status?: VehicleStatus;
  maintenance_fund_available: number | null;
  pure_income: number;
  expense: number;
  adjustments: number;
  net_profit: number;
};

type ProfitabilityResp = {
  period: ProfitabilityPeriod;
  start_date: string;
  end_date: string;
  chart_start_date: string;
  chart_end_date: string;
  series: ProfitabilitySeriesPoint[];
  items: ProfitabilityRow[];
  totals: {
    pure_income: number;
    expense: number;
    adjustments: number;
    net_profit: number;
    maintenance_fund_available: number;
  };
};

function fmtDayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${days[d.getDay()]} ${d.getDate()}`;
}

function fmtShortDate(iso: string): string {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  if (/^\d{4}-\d{2}$/.test(iso)) {
    const mIdx = parseInt(iso.slice(5, 7), 10) - 1;
    return `${months[mIdx] || iso} ${iso.slice(2, 4)}`;
  }
  const d = new Date(iso + "T12:00:00");
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function fmtMonthLabel(ym: string): string {
  const monthsFull = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const mIdx = parseInt(ym.slice(5, 7), 10) - 1;
  return `${monthsFull[mIdx] || ym} ${ym.slice(0, 4)}`;
}

function fmtCompactCOP(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs}`;
}

const StatusBadge = ({ status }: { status?: string }) => {
  if (status === "leasing") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
        🚗 En Leasing
      </span>
    );
  }
  if (status === "reserved") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
        Reservado
      </span>
    );
  }
  if (status === "maintenance") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
        Mantenimiento
      </span>
    );
  }
  if (status === "sold") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
        Vendido
      </span>
    );
  }
  if (status === "inactive") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
        Inactivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
      Activo
    </span>
  );
};

export default function AdminProfit() {
  const todayIso = todayCol();
  const todayYm = todayIso.slice(0, 7);
  const todayYear = todayIso.slice(0, 4);

  const [month, setMonth] = useState(todayYm);
  const [plate, setPlate] = useState("");
  const [data, setData] = useState<ProfitResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(true);

  // View mode: monthly | daily | profitability
  const [viewMode, setViewMode] = useState<"monthly" | "daily" | "profitability">("monthly");
  const [dailyData, setDailyData] = useState<DailyResp | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  // Profitability state
  const [profPeriod, setProfPeriod] = useState<ProfitabilityPeriod>("month");
  const [profDate, setProfDate] = useState<string>(todayIso);
  const [profYear, setProfYear] = useState<string>(todayYear);
  const [profData, setProfData] = useState<ProfitabilityResp | null>(null);
  const [profLoading, setProfLoading] = useState(false);

  // Income/expense detail modal
  const [detailType, setDetailType] = useState<"income" | "expense" | null>(null);
  const [detailPlate, setDetailPlate] = useState<string>("");
  const [detailLabel, setDetailLabel] = useState<string>("");
  const [detailItems, setDetailItems] = useState<(PaymentDetail | ExpenseDetail)[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Ledger side-panel
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerPlate, setLedgerPlate] = useState<string>("");
  const [ledgerItems, setLedgerItems] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Ledger form (create/edit)
  const emptyLedger: Partial<LedgerRow> = {
    date: todayIso,
    type: "extra_expense",
    amount: 0,
    description: "",
    attachment_url: "",
  };
  const [editRow, setEditRow] = useState<Partial<LedgerRow>>(emptyLedger);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Controladores y contadores para evitar respuestas desordenadas al cambiar filtros rápido
  const loadReqRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const dailyReqRef = useRef(0);
  const dailyAbortRef = useRef<AbortController | null>(null);
  const profReqRef = useRef(0);
  const profAbortRef = useRef<AbortController | null>(null);
  const detailReqRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);

  async function load(overrideMonth?: string, overridePlate?: string) {
    const activeMonth = overrideMonth ?? month;
    const activePlate = (overridePlate ?? plate).trim().toUpperCase();
    const reqId = ++loadReqRef.current;
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;

    setLoading(true);
    try {
      const params = new URLSearchParams({ month: activeMonth });
      if (activePlate) params.set("plate", activePlate);

      const rs = await requestWithBasicAuth(`${API}/reports/profit?` + params.toString(), {
        signal: ctrl.signal,
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json: ProfitResp = await rs.json();
      if (reqId === loadReqRef.current) {
        setData(json);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      throw err;
    } finally {
      if (reqId === loadReqRef.current) {
        setLoading(false);
      }
    }
  }

  async function loadDaily(overrideMonth?: string) {
    const activeMonth = overrideMonth ?? month;
    const reqId = ++dailyReqRef.current;
    dailyAbortRef.current?.abort();
    const ctrl = new AbortController();
    dailyAbortRef.current = ctrl;

    setDailyLoading(true);
    try {
      const rs = await requestWithBasicAuth(`${API}/reports/daily?month=${activeMonth}`, {
        signal: ctrl.signal,
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json: DailyResp = await rs.json();
      if (reqId === dailyReqRef.current) {
        setDailyData(json);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      throw err;
    } finally {
      if (reqId === dailyReqRef.current) {
        setDailyLoading(false);
      }
    }
  }

  async function loadProfitability(
    overridePeriod?: ProfitabilityPeriod,
    overrideDate?: string,
    overrideMonth?: string,
    overridePlate?: string,
    overrideYear?: string
  ) {
    const activePeriod = overridePeriod ?? profPeriod;
    const activeDate = overrideDate ?? profDate;
    const activeMonth = overrideMonth ?? month;
    const activeYear = overrideYear ?? profYear;
    const activePlate = (overridePlate ?? plate).trim().toUpperCase();
    const reqId = ++profReqRef.current;
    profAbortRef.current?.abort();
    const ctrl = new AbortController();
    profAbortRef.current = ctrl;

    setProfLoading(true);
    try {
      const params = new URLSearchParams({
        period: activePeriod,
        date: activeDate,
        month: activeMonth,
        year: activeYear,
      });
      if (activePlate) params.set("plate", activePlate);

      const rs = await requestWithBasicAuth(`${API}/reports/profitability?` + params.toString(), {
        signal: ctrl.signal,
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json: ProfitabilityResp = await rs.json();
      if (reqId === profReqRef.current) {
        setProfData(json);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      throw err;
    } finally {
      if (reqId === profReqRef.current) {
        setProfLoading(false);
      }
    }
  }

  function loadCurrent(overrideMonth?: string, overridePlate?: string) {
    if (viewMode === "monthly") load(overrideMonth, overridePlate);
    else if (viewMode === "daily") loadDaily(overrideMonth);
    else loadProfitability(profPeriod, profDate, overrideMonth, overridePlate, profYear);
  }

  // Solo cargamos la pestaña activa ("monthly") al montar la página;
  // las demás pestañas se cargan bajo demanda al abrirlas.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    // Invalidar cachés de las otras pestañas para que recarguen al cambiar de tab
    if (viewMode !== "monthly") setData(null);
    if (viewMode !== "daily") setDailyData(null);
    if (viewMode !== "profitability") setProfData(null);
    loadCurrent();
  }

  function handleMonthChange(nextMonth: string) {
    setMonth(nextMonth);
    if (!nextMonth || !/^\d{4}-\d{2}$/.test(nextMonth)) return;
    if (viewMode !== "monthly") setData(null);
    if (viewMode !== "daily") setDailyData(null);
    if (viewMode !== "profitability") setProfData(null);
    loadCurrent(nextMonth, plate);
  }

  function handlePlateChange(nextPlate: string) {
    const clean = nextPlate.toUpperCase();
    setPlate(clean);
    if (viewMode !== "monthly") setData(null);
    if (viewMode !== "profitability") setProfData(null);
    // Si el usuario limpia el filtro o completa los 6 caracteres de una placa, recargar de inmediato
    if (clean === "" || /^[A-Z]{3}\d{3}$/.test(clean)) {
      loadCurrent(month, clean);
    }
  }

  function handlePeriodChange(nextPeriod: ProfitabilityPeriod) {
    setProfPeriod(nextPeriod);
    loadProfitability(nextPeriod, profDate, month, plate, profYear);
  }

  function handleProfDateChange(nextDate: string) {
    setProfDate(nextDate);
    if (nextDate && /^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      loadProfitability(profPeriod, nextDate, month, plate, profYear);
    }
  }

  function handleProfYearChange(nextYear: string) {
    setProfYear(nextYear);
    if (nextYear && /^\d{4}$/.test(nextYear)) {
      loadProfitability(profPeriod, profDate, month, plate, nextYear);
    }
  }

  // ===== Income/Expense detail =====
  async function openDetail(
    kind: "income" | "expense",
    p: string,
    range?: { from: string; to: string }
  ) {
    const reqId = ++detailReqRef.current;
    detailAbortRef.current?.abort();
    const ctrl = new AbortController();
    detailAbortRef.current = ctrl;

    setDetailType(kind);
    setDetailPlate(p);
    setDetailLabel(
      range
        ? range.from === range.to
          ? range.from
          : `${range.from} a ${range.to}`
        : month
    );
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ plate: p });
      if (range) {
        params.set("from", range.from);
        params.set("to", range.to);
      } else {
        params.set("month", month);
      }
      const endpoint = kind === "income" ? "income-detail" : "expense-detail";

      const rs = await requestWithBasicAuth(`${API}/reports/${endpoint}?` + params.toString(), {
        signal: ctrl.signal,
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json = await rs.json();
      if (reqId === detailReqRef.current) {
        setDetailItems(json.items || []);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      throw err;
    } finally {
      if (reqId === detailReqRef.current) {
        setDetailLoading(false);
      }
    }
  }

  function closeDetail() {
    detailAbortRef.current?.abort();
    setDetailType(null);
    setDetailPlate("");
    setDetailLabel("");
    setDetailItems([]);
  }

  // ===== Ledger panel =====
  async function openLedger(p: string) {
    setLedgerPlate(p);
    setShowLedger(true);
    setLedgerItems([]);
    setEditingId(null);
    setEditRow({ ...emptyLedger, date: todayIso });
    await loadLedger(p);
  }

  async function loadLedger(p: string) {
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({ plate: p, month });

      const rs = await requestWithBasicAuth(`${API}/ledger?` + params.toString());

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json = await rs.json();
      setLedgerItems(json.items || []);
    } finally {
      setLedgerLoading(false);
    }
  }

  async function saveLedger() {
    const body = {
      plate: ledgerPlate,
      date: editRow.date,
      type: editRow.type,
      amount: Number(editRow.amount || 0),
      description: (editRow.description || "").toString().trim() || null,
      attachment_url: (editRow.attachment_url || "").toString().trim() || null,
    };
    const isEdit = !!editingId;

    const rs = await requestWithBasicAuth(`${API}/ledger` + (isEdit ? `/${editingId}` : ""), {
      method: isEdit ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (rs.status === 401 || rs.status === 403) {
      clearBasicAuth();
      throw new Error("Unauthorized");
    }

    if (!rs.ok) throw new Error(await rs.text());
    await loadLedger(ledgerPlate);
    await load(); // refresca totales
    if (viewMode === "profitability") await loadProfitability();
    else setProfData(null);
    setEditingId(null);
    setEditRow({ ...emptyLedger, date: todayIso });
  }

  async function deleteLedger(id: number) {
    if (!confirm("¿Eliminar este ajuste?")) return;

    const rs = await requestWithBasicAuth(`${API}/ledger/${id}`, {
      method: "DELETE",
    });

    if (rs.status === 401 || rs.status === 403) {
      clearBasicAuth();
      throw new Error("Unauthorized");
    }

    if (!rs.ok) throw new Error(await rs.text());
    await loadLedger(ledgerPlate);
    await load();
    if (viewMode === "profitability") await loadProfitability();
    else setProfData(null);
  }

  // ===== Datos de Vista Mensual =====
  const rawItems = data?.items || [];
  const items = showInactive
    ? rawItems
    : rawItems.filter((r) => r.status !== "sold" && r.status !== "inactive");

  const totals = showInactive
    ? data?.totals
    : items.reduce(
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

  const { items: sortedItems, requestSort, sortConfig } = useSortableData(items);

  // ===== Datos de Vista Diaria =====
  const dailyItems = dailyData?.items || [];
  const dailyTotals = dailyData?.totals;
  const {
    items: sortedDailyItems,
    requestSort: requestSortDaily,
    sortConfig: sortConfigDaily,
  } = useSortableData(dailyItems);

  // ===== Datos de Vista Rentabilidad =====
  const rawProfItems = profData?.items || [];
  const filteredProfItems = (
    showInactive
      ? rawProfItems
      : rawProfItems.filter((r) => r.status !== "sold" && r.status !== "inactive")
  ).map((r) => ({
    ...r,
    margin_pct: r.pure_income > 0 ? Number(((r.net_profit / r.pure_income) * 100).toFixed(1)) : null,
  }));

  const profTotals = filteredProfItems.reduce(
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

  const {
    items: sortedProfItems,
    requestSort: requestSortProf,
    sortConfig: sortConfigProf,
  } = useSortableData(filteredProfItems);

  const chartData = (profData?.series || []).map((pt) => ({
    date: pt.date,
    label: fmtShortDate(pt.date),
    pure_income: showInactive ? pt.pure_income : pt.active_pure_income,
    expense: showInactive ? pt.expense : pt.active_expense,
    adjustments: showInactive ? pt.adjustments : pt.active_adjustments,
    net_profit: showInactive ? pt.net_profit : pt.active_net_profit,
  }));

  const SortIcon = ({ columnKey, config }: { columnKey: string; config: any }) => {
    if (config?.key !== columnKey) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
    return config.direction === "asc" ? (
      <ArrowUp className="w-3 h-3" />
    ) : (
      <ArrowDown className="w-3 h-3" />
    );
  };

  const isAnyLoading = loading || dailyLoading || profLoading;
  const periodLabel =
    profPeriod === "day"
      ? "Día"
      : profPeriod === "week"
      ? "Semana"
      : profPeriod === "month"
      ? "Mes"
      : "Año";

  const yearOptions: string[] = [];
  const maxYearOpt = Math.max(Number(todayYear), Number(profYear) || Number(todayYear));
  for (let y = maxYearOpt; y >= FIRST_DATA_YEAR; y--) {
    yearOptions.push(String(y));
  }

  return (
    <CompanyLock>
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-6 text-3xl font-bold tracking-tight">Utilidades — Admin</h1>

          <form onSubmit={onSearch} className="mb-4 flex flex-wrap items-center gap-2">
            {(viewMode !== "profitability" || profPeriod === "month") && (
              <input
                className="rounded-xl border px-3 py-2"
                type="month"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                required
              />
            )}
            {viewMode === "profitability" && profPeriod === "year" && (
              <select
                className="rounded-xl border bg-white px-3 py-2"
                value={profYear}
                onChange={(e) => handleProfYearChange(e.target.value)}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    Año {y}
                  </option>
                ))}
              </select>
            )}
            {viewMode === "profitability" && (profPeriod === "day" || profPeriod === "week") && (
              <div className="flex items-center gap-2">
                <input
                  className="rounded-xl border px-3 py-2"
                  type="date"
                  value={profDate}
                  onChange={(e) => handleProfDateChange(e.target.value)}
                  required
                />
                {profDate !== todayIso && (
                  <button
                    type="button"
                    onClick={() => handleProfDateChange(todayIso)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Hoy
                  </button>
                )}
              </div>
            )}
            {(viewMode === "monthly" || viewMode === "profitability") && (
              <input
                className="rounded-xl border px-3 py-2"
                placeholder="Filtrar por placa (opcional)"
                value={plate}
                onChange={(e) => handlePlateChange(e.target.value)}
              />
            )}
            <button className="rounded-xl bg-black px-4 py-2 text-white">
              {isAnyLoading ? "Cargando..." : "Buscar"}
            </button>
          </form>

          {/* Tab toggle */}
          <div className="mb-4 flex items-center gap-4 flex-wrap">
            <div className="inline-flex rounded-xl border bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setViewMode("monthly");
                  if (!data) load();
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === "monthly"
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500 hover:text-black"
                }`}
              >
                📈 Mensual
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("daily");
                  if (!dailyData) loadDaily();
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === "daily"
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500 hover:text-black"
                }`}
              >
                📊 Diario
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("profitability");
                  if (!profData) loadProfitability();
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === "profitability"
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500 hover:text-black"
                }`}
              >
                💹 Rentabilidad
              </button>
            </div>

            {viewMode === "profitability" && (
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <span className="px-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Periodo:
                </span>
                {(
                  [
                    { key: "day", label: "Día" },
                    { key: "week", label: "Semana" },
                    { key: "month", label: "Mes" },
                    { key: "year", label: "Año" },
                  ] as { key: ProfitabilityPeriod; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handlePeriodChange(opt.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      profPeriod === opt.key
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {(viewMode === "monthly" || viewMode === "profitability") && (
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors shadow-sm">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                Incluir vehículos inactivos/vendidos
              </label>
            )}
          </div>

          {/* ========== VISTA RENTABILIDAD ========== */}
          {viewMode === "profitability" && (
            <div className="space-y-6">
              {/* Tarjetas resumen del periodo */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Ingresos Netos ({periodLabel})
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    ${fmtCOP.format(profTotals.pure_income)}
                  </div>
                  {profData && (
                    <div className="mt-1 text-xs text-slate-500">
                      {profData.start_date === profData.end_date
                        ? profData.start_date
                        : `${profData.start_date} → ${profData.end_date}`}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Gastos Totales ({periodLabel})
                  </div>
                  <div className="mt-1 text-2xl font-bold text-red-600">
                    ${fmtCOP.format(profTotals.expense)}
                  </div>
                  {profTotals.adjustments !== 0 && (
                    <div className="mt-1 text-xs text-slate-500">
                      Ajustes: ${fmtCOP.format(profTotals.adjustments)}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Utilidad Neta Total
                  </div>
                  <div
                    className={`mt-1 text-2xl font-bold ${
                      profTotals.net_profit >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    ${fmtCOP.format(profTotals.net_profit)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {profTotals.pure_income > 0
                      ? `Margen neto: ${((profTotals.net_profit / profTotals.pure_income) * 100).toFixed(1)}%`
                      : "Sin ingresos en el periodo"}
                  </div>
                </div>
              </div>

              {/* Gráfico de líneas superior: Tendencia de la Utilidad Neta Total */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                      Tendencia de la Utilidad Neta Total
                    </h2>
                    <p className="text-xs text-slate-500">
                      {profPeriod === "day"
                        ? `Evolución diaria de los últimos 7 días hasta ${profData?.end_date || profDate}`
                        : profPeriod === "week"
                        ? `Evolución diaria de la semana (${profData?.start_date || ""} a ${profData?.end_date || ""})`
                        : profPeriod === "month"
                        ? `Evolución diaria del mes (${profData?.chart_start_date || month} a ${profData?.chart_end_date || month})`
                        : `Evolución mensual del año ${profYear} (${profData?.chart_start_date?.slice(0, 7) || `${profYear}-01`} a ${profData?.chart_end_date?.slice(0, 7) || `${profYear}-12`})`}
                    </p>
                  </div>
                </div>

                <div className="h-80 w-full">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 12, fill: "#64748b" }}
                          tickMargin={8}
                          minTickGap={20}
                        />
                        <YAxis
                          tickFormatter={(val) => fmtCompactCOP(Number(val))}
                          tick={{ fontSize: 12, fill: "#64748b" }}
                          width={70}
                        />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                        <RechartsTooltip
                          formatter={(value: any, name: any) => [
                            `$${fmtCOP.format(Number(value || 0))}`,
                            name,
                          ]}
                          labelFormatter={(_label, payload) => {
                            const rawDate = payload?.[0]?.payload?.date;
                            if (!rawDate) return _label;
                            if (/^\d{4}-\d{2}$/.test(rawDate)) {
                              return `Mes: ${fmtMonthLabel(rawDate)} (${rawDate})`;
                            }
                            return `Fecha: ${rawDate} (${fmtDayLabel(rawDate)})`;
                          }}
                          contentStyle={{
                            borderRadius: "12px",
                            borderColor: "#e2e8f0",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="net_profit"
                          name="Utilidad Neta Total"
                          stroke="#10b981"
                          strokeWidth={3}
                          dot={{ r: 3, fill: "#10b981" }}
                          activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="pure_income"
                          name="Ingresos"
                          stroke="#0ea5e9"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="expense"
                          name="Gastos"
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      {profLoading ? "Cargando gráfico..." : "Sin datos para graficar en este periodo."}
                    </div>
                  )}
                </div>
              </div>

              {/* Tabla inferior ordenable por placa */}
              <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
                <div className="border-b px-5 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Desglose de Rentabilidad por Vehículo
                    </h3>
                    <p className="text-xs text-slate-500">
                      Haz clic en cualquier encabezado para ordenar por placa, ingresos, gastos o rentabilidad neta.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {sortedProfItems.length} vehículo{sortedProfItems.length === 1 ? "" : "s"}
                  </span>
                </div>

                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">
                        <div
                          onClick={() => requestSortProf("plate")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                        >
                          Placa <SortIcon columnKey="plate" config={sortConfigProf} />
                        </div>
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        <div
                          onClick={() => requestSortProf("pure_income")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                        >
                          Ingresos <SortIcon columnKey="pure_income" config={sortConfigProf} />
                        </div>
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        <div
                          onClick={() => requestSortProf("expense")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                        >
                          Gastos <SortIcon columnKey="expense" config={sortConfigProf} />
                        </div>
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        <div
                          onClick={() => requestSortProf("adjustments")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                        >
                          Ajustes <SortIcon columnKey="adjustments" config={sortConfigProf} />
                        </div>
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        <div
                          onClick={() => requestSortProf("maintenance_fund_available")}
                          title="Saldo disponible actual del Fondo de Mantenimiento (solo contratos de leasing activos)"
                          className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                        >
                          Fondo Mant. (Hoy){" "}
                          <SortIcon columnKey="maintenance_fund_available" config={sortConfigProf} />
                        </div>
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        <div
                          onClick={() => requestSortProf("net_profit")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                        >
                          Rentabilidad Neta <SortIcon columnKey="net_profit" config={sortConfigProf} />
                        </div>
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        <div
                          onClick={() => requestSortProf("margin_pct")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                        >
                          Margen % <SortIcon columnKey="margin_pct" config={sortConfigProf} />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProfItems.map((r) => (
                      <tr key={r.plate} className="border-t hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            {r.plate}
                            <StatusBadge status={r.status} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {r.pure_income > 0 && profData ? (
                            <button
                              type="button"
                              onClick={() =>
                                openDetail("income", r.plate, {
                                  from: profData.start_date,
                                  to: profData.end_date,
                                })
                              }
                              className="underline hover:text-emerald-700"
                              title="Ver pagos confirmados en el periodo"
                            >
                              ${fmtCOP.format(r.pure_income)}
                            </button>
                          ) : (
                            <>${fmtCOP.format(0)}</>
                          )}
                        </td>
                        <td className="px-4 py-3 text-red-600">
                          {r.expense > 0 && profData ? (
                            <button
                              type="button"
                              onClick={() =>
                                openDetail("expense", r.plate, {
                                  from: profData.start_date,
                                  to: profData.end_date,
                                })
                              }
                              className="underline hover:text-red-800"
                              title="Ver gastos prorrateados en el periodo"
                            >
                              ${fmtCOP.format(r.expense)}
                            </button>
                          ) : (
                            <>${fmtCOP.format(0)}</>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          ${fmtCOP.format(r.adjustments)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.maintenance_fund_available != null
                            ? `$${fmtCOP.format(r.maintenance_fund_available)}`
                            : "—"}
                        </td>
                        <td
                          className={`px-4 py-3 font-semibold ${
                            r.net_profit >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          ${fmtCOP.format(r.net_profit)}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-600">
                          {r.margin_pct != null ? `${r.margin_pct}%` : "—"}
                        </td>
                      </tr>
                    ))}

                    {sortedProfItems.length === 0 && !profLoading && (
                      <tr>
                        <td className="px-4 py-6 text-gray-500" colSpan={7}>
                          Sin datos para este periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-gray-50">
                      <td className="px-4 py-3 font-semibold">TOTAL</td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(profTotals.pure_income)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600">
                        ${fmtCOP.format(profTotals.expense)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(profTotals.adjustments)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(profTotals.maintenance_fund_available)}
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          profTotals.net_profit >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        ${fmtCOP.format(profTotals.net_profit)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-xs text-slate-600">
                        {profTotals.pure_income > 0
                          ? `${((profTotals.net_profit / profTotals.pure_income) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ========== VISTA DIARIA ========== */}
          {viewMode === "daily" && (
            <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSortDaily("date")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Fecha <SortIcon columnKey="date" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSortDaily("pure_income")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Ingreso Neto <SortIcon columnKey="pure_income" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSortDaily("deposits")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Depósitos <SortIcon columnKey="deposits" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSortDaily("advances")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Anticipos <SortIcon columnKey="advances" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSortDaily("maintenance")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Prov. Mant. <SortIcon columnKey="maintenance" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSortDaily("expense")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Gastos <SortIcon columnKey="expense" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSortDaily("daily_profit")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Utilidad Diaria <SortIcon columnKey="daily_profit" config={sortConfigDaily} />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDailyItems.map((r) => (
                    <tr key={r.date} className="border-t">
                      <td className="px-4 py-3 font-medium">{fmtDayLabel(r.date)}</td>
                      <td className="px-4 py-3">${fmtCOP.format(r.pure_income)}</td>
                      <td className="px-4 py-3 text-gray-500">${fmtCOP.format(r.deposits)}</td>
                      <td className="px-4 py-3 text-gray-500">${fmtCOP.format(r.advances)}</td>
                      <td className="px-4 py-3 text-gray-500">${fmtCOP.format(r.maintenance)}</td>
                      <td className="px-4 py-3 text-red-600">${fmtCOP.format(r.expense)}</td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          r.daily_profit >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        ${fmtCOP.format(r.daily_profit)}
                      </td>
                    </tr>
                  ))}

                  {sortedDailyItems.length === 0 && !dailyLoading && (
                    <tr>
                      <td className="px-4 py-6 text-gray-500" colSpan={7}>
                        Sin datos para este mes.
                      </td>
                    </tr>
                  )}
                </tbody>

                {dailyTotals && (
                  <tfoot>
                    <tr className="border-t bg-gray-50">
                      <td className="px-4 py-3 font-semibold">TOTAL</td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(dailyTotals.pure_income)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(dailyTotals.deposits)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(dailyTotals.advances)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(dailyTotals.maintenance)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600">
                        ${fmtCOP.format(dailyTotals.expense)}
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          dailyTotals.daily_profit >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        ${fmtCOP.format(dailyTotals.daily_profit)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* ========== VISTA MENSUAL ========== */}
          {viewMode === "monthly" && (
            <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("plate")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Placa <SortIcon columnKey="plate" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("pure_income")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Ingreso Neto <SortIcon columnKey="pure_income" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("deposits_total")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Depósitos <SortIcon columnKey="deposits_total" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("advances_total")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Anticipos <SortIcon columnKey="advances_total" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("expense")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Gastos <SortIcon columnKey="expense" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("adjustments")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Ajustes <SortIcon columnKey="adjustments" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("maintenance_provision")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Prov. Mant. <SortIcon columnKey="maintenance_provision" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("maintenance_fund_available")}
                        title="Saldo disponible actual del Fondo de Mantenimiento (solo contratos de leasing activos)"
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Fondo Mant. (Hoy){" "}
                        <SortIcon columnKey="maintenance_fund_available" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("profit")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Utilidad <SortIcon columnKey="profit" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("cum_profit")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Acum. <SortIcon columnKey="cum_profit" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("investment_total")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Inversión <SortIcon columnKey="investment_total" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("remaining")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Restante <SortIcon columnKey="remaining" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div
                        onClick={() => requestSort("is_released")}
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max"
                      >
                        Liberado <SortIcon columnKey="is_released" config={sortConfig} />
                      </div>
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((r) => (
                    <tr key={r.plate} className="border-t">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {r.plate}
                          <StatusBadge status={r.status} />
                        </div>
                      </td>

                      {/* Ingreso Neto: clickeable para ver detalle */}
                      <td className="px-4 py-3">
                        {r.pure_income > 0 ? (
                          <button
                            type="button"
                            onClick={() => openDetail("income", r.plate)}
                            className="underline"
                            title="Ver ingresos del mes"
                          >
                            ${fmtCOP.format(r.pure_income)}
                          </button>
                        ) : (
                          <>${fmtCOP.format(0)}</>
                        )}
                      </td>

                      {/* Depósitos (info) */}
                      <td className="px-4 py-3 text-gray-500">${fmtCOP.format(r.deposits_total)}</td>

                      {/* Anticipos (info) */}
                      <td className="px-4 py-3 text-gray-500">${fmtCOP.format(r.advances_total)}</td>

                      {/* Gastos: clickeable para ver detalle */}
                      <td className="px-4 py-3">
                        {r.expense > 0 ? (
                          <button
                            type="button"
                            onClick={() => openDetail("expense", r.plate)}
                            className="underline"
                            title="Ver gastos del mes"
                          >
                            ${fmtCOP.format(r.expense)}
                          </button>
                        ) : (
                          <>${fmtCOP.format(0)}</>
                        )}
                      </td>

                      <td className="px-4 py-3">${fmtCOP.format(r.adjustments)}</td>
                      <td className="px-4 py-3 text-gray-500">
                        ${fmtCOP.format(r.maintenance_provision)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {r.maintenance_fund_available != null
                          ? `$${fmtCOP.format(r.maintenance_fund_available)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold">${fmtCOP.format(r.profit)}</td>
                      <td className="px-4 py-3">${fmtCOP.format(r.cum_profit)}</td>
                      <td className="px-4 py-3">
                        {r.investment_total != null ? `$${fmtCOP.format(r.investment_total)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.remaining != null ? `$${fmtCOP.format(r.remaining)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.is_released ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                            Sí
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                            No
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openLedger(r.plate)}
                          className="rounded-lg border px-3 py-1 text-xs"
                          title="Ver/editar ajustes del mes"
                        >
                          Ajustes
                        </button>
                      </td>
                    </tr>
                  ))}

                  {sortedItems.length === 0 && !loading && (
                    <tr>
                      <td className="px-4 py-6 text-gray-500" colSpan={14}>
                        Sin datos.
                      </td>
                    </tr>
                  )}
                </tbody>

                {totals && (
                  <tfoot>
                    <tr className="border-t bg-gray-50">
                      <td className="px-4 py-3 font-semibold">TOTAL</td>
                      <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.pure_income)}</td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(totals.deposits_total)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(totals.advances_total)}
                      </td>
                      <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.expense)}</td>
                      <td className="px-4 py-3 font-semibold">—</td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(totals.maintenance_provision)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(totals.maintenance_fund_available ?? 0)}
                      </td>
                      <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.profit)}</td>
                      <td className="px-4 py-3 font-semibold">—</td>
                      <td className="px-4 py-3 font-semibold">
                        ${fmtCOP.format(totals.investment_total)}
                      </td>
                      <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.remaining)}</td>
                      <td className="px-4 py-3 font-semibold">—</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Income/Expense detail modal */}
        {detailType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {detailType === "income" ? "Detalle de Ingresos" : "Detalle de Gastos"} —{" "}
                  {detailPlate} — {detailLabel || month}
                </h2>
                <button onClick={closeDetail} className="rounded-xl border px-3 py-1 text-sm">
                  Cerrar
                </button>
              </div>

              {detailLoading ? (
                <div className="text-sm text-gray-600">Cargando…</div>
              ) : detailItems.length === 0 ? (
                <div className="text-sm text-gray-600">Sin items.</div>
              ) : detailType === "income" ? (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {(detailItems as PaymentDetail[]).map((p) => (
                    <div key={p.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{p.payment_date}</div>
                        <div className="font-semibold">${fmtCOP.format(p.amount)}</div>
                      </div>
                      <div className="text-sm text-gray-600">
                        {p.payer_name} {p.installment_number ? `· Cuota ${p.installment_number}` : ""}{" "}
                        · {p.status}
                        {p.delivery_amount != null && (
                          <span className="ml-2 text-xs text-emerald-700">
                            (Ingreso neto: ${fmtCOP.format(p.delivery_amount)})
                          </span>
                        )}
                      </div>
                      {p.proof_url && (
                        <a
                          href={p.proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline"
                        >
                          Ver comprobante
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {(detailItems as ExpenseDetail[]).map((e) => (
                    <div key={e.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {e.date} — {e.item}
                        </div>
                        <div className="font-semibold">${fmtCOP.format(e.share_amount)}</div>
                      </div>
                      <div className="text-sm text-gray-600">{e.description || "—"}</div>
                      {e.attachment_url && (
                        <a
                          href={e.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline"
                        >
                          Ver soporte
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ledger side panel */}
        {showLedger && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
            <div className="h-full w-full max-w-xl bg-white p-5 shadow-xl overflow-y-auto">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  Ajustes — {ledgerPlate} — {month}
                </h2>
                <button
                  onClick={() => setShowLedger(false)}
                  className="rounded-xl border px-3 py-1 text-sm"
                >
                  Cerrar
                </button>
              </div>

              {/* Formulario crear/editar */}
              <div className="mb-4 rounded-2xl border p-4">
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Fecha</label>
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      type="date"
                      value={editRow.date || ""}
                      onChange={(e) => setEditRow({ ...editRow, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Tipo</label>
                    <select
                      className="w-full rounded-xl border px-3 py-2"
                      value={editRow.type || "extra_expense"}
                      onChange={(e) =>
                        setEditRow({ ...editRow, type: e.target.value as LedgerRow["type"] })
                      }
                    >
                      <option value="opening_balance">Saldo inicial</option>
                      <option value="extra_income">Ingreso extra</option>
                      <option value="extra_expense">Gasto extra</option>
                      <option value="correction">Corrección</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Monto (COP)</label>
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      inputMode="numeric"
                      placeholder="65.000"
                      value={editRow.amount ?? 0}
                      onChange={(e) =>
                        setEditRow({
                          ...editRow,
                          amount: Number((e.target.value || "0").replace(/[^\d-]/g, "")),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Adjunto (URL)</label>
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      value={editRow.attachment_url || ""}
                      onChange={(e) =>
                        setEditRow({ ...editRow, attachment_url: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Descripción</label>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    value={editRow.description || ""}
                    onChange={(e) =>
                      setEditRow({ ...editRow, description: e.target.value })
                    }
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditRow({
                          ...emptyLedger,
                          date: todayIso,
                        });
                      }}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      Cancelar edición
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={saveLedger}
                    className="rounded-xl bg-black px-4 py-2 text-white"
                  >
                    {editingId ? "Guardar cambios" : "Agregar ajuste"}
                  </button>
                </div>
              </div>

              {/* Lista de ajustes */}
              <div className="space-y-2">
                {ledgerLoading ? (
                  <div className="text-sm text-gray-600">Cargando ajustes…</div>
                ) : ledgerItems.length === 0 ? (
                  <div className="text-sm text-gray-600">Sin ajustes para este mes.</div>
                ) : (
                  ledgerItems.map((l) => (
                    <div key={l.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {l.date} — {labelType(l.type)} — ${fmtCOP.format(l.amount)}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="text-xs underline"
                            onClick={() => {
                              setEditingId(l.id);
                              setEditRow(l);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="text-xs underline text-red-600"
                            onClick={() => deleteLedger(l.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600">
                        {l.description || "—"}
                        {l.attachment_url && (
                          <>
                            {" · "}
                            <a
                              className="underline"
                              href={l.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver adjunto
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </CompanyLock>
  );
}

function labelType(t: LedgerRow["type"]) {
  switch (t) {
    case "opening_balance":
      return "Saldo inicial";
    case "extra_income":
      return "Ingreso extra";
    case "extra_expense":
      return "Gasto extra";
    case "correction":
      return "Corrección";
    default:
      return t;
  }
}
