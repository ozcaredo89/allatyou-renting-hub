import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import CompanyLock from "../components/CompanyLock"; // <--- 1. IMPORTAR
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { useSortableData } from "../hooks/useSortableData";
const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

type ProfitRow = {
  plate: string;
  status?: 'active' | 'maintenance' | 'sold' | 'inactive';
  month: string;
  pure_income: number;
  deposits_total: number;
  advances_total: number;
  maintenance_provision: number;
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

function fmtDayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${days[d.getDay()]} ${d.getDate()}`;
}

const StatusBadge = ({ status }: { status?: string }) => {
  if (status === 'maintenance') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">Mantenimiento</span>;
  if (status === 'sold') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300">Vendido</span>;
  if (status === 'inactive') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">Inactivo</span>;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Activo</span>;
};

export default function AdminProfit() {
  const todayYm = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(todayYm);
  const [plate, setPlate] = useState("");
  const [data, setData] = useState<ProfitResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(true);

  // View mode & daily data
  const [viewMode, setViewMode] = useState<"monthly" | "daily">("monthly");
  const [dailyData, setDailyData] = useState<DailyResp | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  // Income/expense detail modal
  const [detailType, setDetailType] = useState<"income" | "expense" | null>(null);
  const [detailPlate, setDetailPlate] = useState<string>("");
  const [detailItems, setDetailItems] = useState<(PaymentDetail | ExpenseDetail)[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Ledger side-panel
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerPlate, setLedgerPlate] = useState<string>("");
  const [ledgerItems, setLedgerItems] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Ledger form (create/edit)
  const emptyLedger: Partial<LedgerRow> = {
    date: new Date().toISOString().slice(0, 10),
    type: "extra_expense",
    amount: 0,
    description: "",
    attachment_url: "",
  };
  const [editRow, setEditRow] = useState<Partial<LedgerRow>>(emptyLedger);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const params = new URLSearchParams({ month });
      if (plate) params.set("plate", plate.trim().toUpperCase());

      const rs = await fetch(`${API}/reports/profit?` + params.toString(), {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json: ProfitResp = await rs.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  async function loadDaily() {
    setDailyLoading(true);
    try {
      const auth = ensureBasicAuth();
      const rs = await fetch(`${API}/reports/daily?month=${month}`, {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json: DailyResp = await rs.json();
      setDailyData(json);
    } finally {
      setDailyLoading(false);
    }
  }

  function loadCurrent() {
    if (viewMode === "monthly") load();
    else loadDaily();
  }

  useEffect(() => {
    load();
    loadDaily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    loadCurrent();
  }

  // ===== Income/Expense detail =====
  async function openDetail(kind: "income" | "expense", p: string) {
    setDetailType(kind);
    setDetailPlate(p);
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const auth = ensureBasicAuth();
      const params = new URLSearchParams({ plate: p, month });
      const endpoint = kind === "income" ? "income-detail" : "expense-detail";

      const rs = await fetch(`${API}/reports/${endpoint}?` + params.toString(), {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json = await rs.json();
      setDetailItems(json.items || []);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailType(null);
    setDetailPlate("");
    setDetailItems([]);
  }

  // ===== Ledger panel =====
  async function openLedger(p: string) {
    setLedgerPlate(p);
    setShowLedger(true);
    setLedgerItems([]);
    setEditingId(null);
    setEditRow({ ...emptyLedger, date: new Date().toISOString().slice(0, 10) });
    await loadLedger(p);
  }

  async function loadLedger(p: string) {
    setLedgerLoading(true);
    try {
      const auth = ensureBasicAuth();
      const params = new URLSearchParams({ plate: p, month });

      const rs = await fetch(`${API}/ledger?` + params.toString(), {
        headers: { Authorization: auth },
      });

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

    const auth = ensureBasicAuth();

    const rs = await fetch(`${API}/ledger` + (isEdit ? `/${editingId}` : ""), {
      method: isEdit ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
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
    setEditingId(null);
    setEditRow({ ...emptyLedger, date: new Date().toISOString().slice(0, 10) });
  }

  async function deleteLedger(id: number) {
    if (!confirm("¿Eliminar este ajuste?")) return;

    const auth = ensureBasicAuth();

    const rs = await fetch(`${API}/ledger/${id}`, {
      method: "DELETE",
      headers: { Authorization: auth },
    });

    if (rs.status === 401 || rs.status === 403) {
      clearBasicAuth();
      throw new Error("Unauthorized");
    }

    if (!rs.ok) throw new Error(await rs.text());
    await loadLedger(ledgerPlate);
    await load();
  }

  const rawItems = data?.items || [];
  const items = showInactive ? rawItems : rawItems.filter(r => r.status !== 'sold' && r.status !== 'inactive');

  const totals = showInactive ? data?.totals : items.reduce((acc, r) => {
    acc.pure_income += r.pure_income;
    acc.deposits_total += r.deposits_total;
    acc.advances_total += r.advances_total;
    acc.maintenance_provision += r.maintenance_provision;
    acc.expense += r.expense;
    acc.adjustments += r.adjustments;
    acc.profit += r.profit;
    acc.investment_total += Number(r.investment_total || 0);
    if (r.remaining != null) acc.remaining += Number(r.remaining || 0);
    return acc;
  }, { pure_income: 0, deposits_total: 0, advances_total: 0, maintenance_provision: 0, expense: 0, adjustments: 0, profit: 0, investment_total: 0, remaining: 0 });

  const { items: sortedItems, requestSort, sortConfig } = useSortableData(items);

  const dailyItems = dailyData?.items || [];
  const dailyTotals = dailyData?.totals;
  const { items: sortedDailyItems, requestSort: requestSortDaily, sortConfig: sortConfigDaily } = useSortableData(dailyItems);

  const SortIcon = ({ columnKey, config }: { columnKey: string, config: any }) => {
    if (config?.key !== columnKey) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
    return config.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  // 2. ENVOLVER EL RETURN COMPLETO CON <CompanyLock>
  return (
    <CompanyLock>
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="mb-6 text-3xl font-bold tracking-tight">Utilidades — Admin</h1>

          <form onSubmit={onSearch} className="mb-4 flex flex-wrap items-center gap-2">
            <input
              className="rounded-xl border px-3 py-2"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              required
            />
            {viewMode === "monthly" && (
              <input
                className="rounded-xl border px-3 py-2"
                placeholder="Filtrar por placa (opcional)"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
              />
            )}
            <button className="rounded-xl bg-black px-4 py-2 text-white">
              {(loading || dailyLoading) ? "Cargando..." : "Buscar"}
            </button>
          </form>

          {/* Tab toggle */}
          {/* Tab toggle */}
          <div className="mb-4 flex items-center gap-4 flex-wrap">
            <div className="inline-flex rounded-xl border bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode("monthly")}
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
                onClick={() => { setViewMode("daily"); if (!dailyData) loadDaily(); }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === "daily"
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500 hover:text-black"
                }`}
              >
                📊 Diario
              </button>
            </div>
            {viewMode === "monthly" && (
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

          {/* ========== VISTA DIARIA ========== */}
          {viewMode === "daily" && (
            <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      <div onClick={() => requestSortDaily('date')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                        Fecha <SortIcon columnKey="date" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div onClick={() => requestSortDaily('pure_income')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                        Ingreso Neto <SortIcon columnKey="pure_income" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div onClick={() => requestSortDaily('deposits')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                        Depósitos <SortIcon columnKey="deposits" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div onClick={() => requestSortDaily('advances')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                        Anticipos <SortIcon columnKey="advances" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div onClick={() => requestSortDaily('maintenance')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                        Prov. Mant. <SortIcon columnKey="maintenance" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div onClick={() => requestSortDaily('expense')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                        Gastos <SortIcon columnKey="expense" config={sortConfigDaily} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <div onClick={() => requestSortDaily('daily_profit')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
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
                      <td className={`px-4 py-3 font-semibold ${r.daily_profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        ${fmtCOP.format(r.daily_profit)}
                      </td>
                    </tr>
                  ))}

                  {sortedDailyItems.length === 0 && !dailyLoading && (
                    <tr>
                      <td className="px-4 py-6 text-gray-500" colSpan={7}>Sin datos para este mes.</td>
                    </tr>
                  )}
                </tbody>

                {dailyTotals && (
                  <tfoot>
                    <tr className="border-t bg-gray-50">
                      <td className="px-4 py-3 font-semibold">TOTAL</td>
                      <td className="px-4 py-3 font-semibold">${fmtCOP.format(dailyTotals.pure_income)}</td>
                      <td className="px-4 py-3 font-semibold">${fmtCOP.format(dailyTotals.deposits)}</td>
                      <td className="px-4 py-3 font-semibold">${fmtCOP.format(dailyTotals.advances)}</td>
                      <td className="px-4 py-3 font-semibold">${fmtCOP.format(dailyTotals.maintenance)}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">${fmtCOP.format(dailyTotals.expense)}</td>
                      <td className={`px-4 py-3 font-semibold ${dailyTotals.daily_profit >= 0 ? "text-green-600" : "text-red-600"}`}>
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
                    <div onClick={() => requestSort('plate')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Placa <SortIcon columnKey="plate" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('pure_income')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Ingreso Neto <SortIcon columnKey="pure_income" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('deposits_total')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Depósitos <SortIcon columnKey="deposits_total" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('advances_total')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Anticipos <SortIcon columnKey="advances_total" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('expense')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Gastos <SortIcon columnKey="expense" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('adjustments')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Ajustes <SortIcon columnKey="adjustments" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('maintenance_provision')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Prov. Mant. <SortIcon columnKey="maintenance_provision" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('profit')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Utilidad <SortIcon columnKey="profit" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('cum_profit')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Acum. <SortIcon columnKey="cum_profit" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('investment_total')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Inversión <SortIcon columnKey="investment_total" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('remaining')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                      Restante <SortIcon columnKey="remaining" config={sortConfig} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <div onClick={() => requestSort('is_released')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
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
                    <td className="px-4 py-3 text-gray-500">${fmtCOP.format(r.maintenance_provision)}</td>
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
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Sí</span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">No</span>
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
                    <td className="px-4 py-6 text-gray-500" colSpan={13}>
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
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.deposits_total)}</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.advances_total)}</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.expense)}</td>
                    <td className="px-4 py-3 font-semibold">—</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.maintenance_provision)}</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.profit)}</td>
                    <td className="px-4 py-3 font-semibold">—</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.investment_total)}</td>
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
                  {detailType === "income" ? "Detalle de Ingresos" : "Detalle de Gastos"} — {detailPlate} — {month}
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
                        {p.payer_name} {p.installment_number ? `· Cuota ${p.installment_number}` : ""} · {p.status}
                      </div>
                      {p.proof_url && (
                        <a href={p.proof_url} target="_blank" rel="noreferrer" className="text-xs underline">
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
                        <a href={e.attachment_url} target="_blank" rel="noreferrer" className="text-xs underline">
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
                          date: new Date().toISOString().slice(0, 10),
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