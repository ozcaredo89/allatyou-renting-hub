// web/src/pages/AdminProfit.tsx
import { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

type ProfitRow = {
  plate: string;
  month: string; // YYYY-MM-01
  income: number;
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
  month: string; // YYYY-MM
  items: ProfitRow[];
  totals: {
    income: number;
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

export default function AdminProfit() {
  const todayYm = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [month, setMonth] = useState(todayYm);
  const [plate, setPlate] = useState("");
  const [data, setData] = useState<ProfitResp | null>(null);
  const [loading, setLoading] = useState(false);

  // Modal state for details
  const [detailType, setDetailType] = useState<"income" | "expense" | null>(null);
  const [detailPlate, setDetailPlate] = useState<string>("");
  const [detailItems, setDetailItems] = useState<(PaymentDetail | ExpenseDetail)[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (plate) params.set("plate", plate.trim().toUpperCase());
      const rs = await fetch(`${API}/reports/profit?` + params.toString());
      if (!rs.ok) throw new Error(await rs.text());
      const json: ProfitResp = await rs.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  // Open modal and fetch detail
  async function openDetail(kind: "income" | "expense", p: string) {
    setDetailType(kind);
    setDetailPlate(p);
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ plate: p, month });
      const endpoint = kind === "income" ? "income-detail" : "expense-detail";
      const rs = await fetch(`${API}/reports/${endpoint}?` + params.toString());
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

  const items = data?.items || [];
  const totals = data?.totals;

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Monthly profit — Admin</h1>

        <form onSubmit={onSearch} className="mb-4 flex flex-wrap gap-2">
          <input
            className="rounded-xl border px-3 py-2"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            required
          />
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Filter by plate (optional)"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
          />
          <button className="rounded-xl bg-black px-4 py-2 text-white">
            {loading ? "Loading..." : "Search"}
          </button>
        </form>

        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Placa</th>
                <th className="px-4 py-3 font-semibold">Ingresos</th>
                <th className="px-4 py-3 font-semibold">Gastos</th>
                <th className="px-4 py-3 font-semibold">Adjustments</th>
                <th className="px-4 py-3 font-semibold">Profit</th>
                <th className="px-4 py-3 font-semibold">Cum. Profit</th>
                <th className="px-4 py-3 font-semibold">Investment</th>
                <th className="px-4 py-3 font-semibold">Remaining</th>
                <th className="px-4 py-3 font-semibold">Released</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.plate} className="border-t">
                    <td className="px-4 py-3 font-medium">{r.plate}</td>

                    {/* Income clickable */}
                    <td className="px-4 py-3">
                    {r.income > 0 ? (
                        <button
                        type="button"
                        onClick={() => openDetail("income", r.plate)}
                        className="underline hover:opacity-80 cursor-pointer"
                        title="Ver detalle de ingresos"
                        >
                        ${fmtCOP.format(r.income)}
                        </button>
                    ) : (
                        <>${fmtCOP.format(r.income)}</>
                    )}
                    </td>

                    {/* Expense clickable */}
                    <td className="px-4 py-3">
                    {r.expense > 0 ? (
                        <button
                        type="button"
                        onClick={() => openDetail("expense", r.plate)}
                        className="underline hover:opacity-80 cursor-pointer"
                        title="Ver detalle de gastos"
                        >
                        ${fmtCOP.format(r.expense)}
                        </button>
                    ) : (
                        <>${fmtCOP.format(r.expense)}</>
                    )}
                    </td>

                  <td className="px-4 py-3">${fmtCOP.format(r.adjustments)}</td>
                  <td className="px-4 py-3 font-semibold">
                    ${fmtCOP.format(r.profit)}
                  </td>
                  <td className="px-4 py-3">${fmtCOP.format(r.cum_profit)}</td>
                  <td className="px-4 py-3">
                    {r.investment_total != null ? `$${fmtCOP.format(r.investment_total)}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.remaining != null ? `$${fmtCOP.format(r.remaining)}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.is_released ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Yes</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">No</span>
                    )}
                  </td>
                </tr>
              ))}

              {items.length === 0 && !loading && (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={9}>No data.</td>
                </tr>
              )}
            </tbody>

            {totals && (
              <tfoot>
                <tr className="border-t bg-gray-50">
                  <td className="px-4 py-3 font-semibold">TOTAL</td>
                  <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.income)}</td>
                  <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.expense)}</td>
                  <td className="px-4 py-3 font-semibold">—</td>
                  <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.profit)}</td>
                  <td className="px-4 py-3 font-semibold">—</td>
                  <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.investment_total)}</td>
                  <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.remaining)}</td>
                  <td className="px-4 py-3 font-semibold">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detailType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {detailType === "income" ? "Detalle de Ingresos" : "Detalle de Gastos"} — {detailPlate} — {month}
              </h2>
              <button onClick={closeDetail} className="rounded-xl border px-3 py-1 text-sm">Close</button>
            </div>

            {detailLoading ? (
              <div className="text-sm text-gray-600">Loading…</div>
            ) : detailItems.length === 0 ? (
              <div className="text-sm text-gray-600">No items.</div>
            ) : detailType === "income" ? (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {(detailItems as PaymentDetail[]).map(p => (
                  <div key={p.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{p.payment_date}</div>
                      <div className="font-semibold">${fmtCOP.format(p.amount)}</div>
                    </div>
                    <div className="text-sm text-gray-600">
                      {p.payer_name} {p.installment_number ? `· Cuota ${p.installment_number}` : ""}
                      {p.status ? ` · ${p.status}` : ""}
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
                {(detailItems as ExpenseDetail[]).map(e => (
                  <div key={e.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{e.date} — {e.item}</div>
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
    </div>
  );
}
