// web/src/pages/AdminProfit.tsx
import { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmt = new Intl.NumberFormat("es-CO");

type Row = {
  plate: string;
  month: string; // YYYY-MM-01
  income: number;
  expense: number;
  adjustments: number;
  profit: number;
  cum_profit: number;
  investment_total: number;
  remaining: number | null;
  pct_recovered: number | null;
  is_released: boolean;
};

export default function AdminProfit() {
  const today = new Date();
  const defMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;

  const [month, setMonth] = useState(defMonth);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rs = await fetch(`${API}/reports/profit?month=${month}`);
      if (!rs.ok) throw new Error(await rs.text());
      const json = await rs.json();
      setRows(json.items || []);
      setTotals(json.totals || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-3xl font-bold">Utilidad mensual</h1>

        <div className="mb-4 flex gap-2">
          <input
            type="month"
            value={month}
            onChange={(e)=>setMonth(e.target.value)}
            className="rounded-xl border px-3 py-2"
          />
          <button onClick={load} className="rounded-xl bg-black px-4 py-2 text-white">
            {loading ? "Cargando..." : "Consultar"}
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">Placa</th>
                <th className="px-4 py-3 text-right">Ingresos</th>
                <th className="px-4 py-3 text-right">Gastos</th>
                <th className="px-4 py-3 text-right">Ajustes</th>
                <th className="px-4 py-3 text-right">Utilidad (mes)</th>
                <th className="px-4 py-3 text-right">Acumulado</th>
                <th className="px-4 py-3 text-right">Inversión</th>
                <th className="px-4 py-3 text-right">Faltante</th>
                <th className="px-4 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.plate} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.plate}</td>
                  <td className="px-4 py-3 text-right">${fmt.format(r.income || 0)}</td>
                  <td className="px-4 py-3 text-right">${fmt.format(r.expense || 0)}</td>
                  <td className="px-4 py-3 text-right">${fmt.format(r.adjustments || 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold">${fmt.format(r.profit || 0)}</td>
                  <td className="px-4 py-3 text-right">${fmt.format(r.cum_profit || 0)}</td>
                  <td className="px-4 py-3 text-right">${fmt.format(r.investment_total || 0)}</td>
                  <td className="px-4 py-3 text-right">
                    {r.remaining != null ? `$${fmt.format(r.remaining)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-3 py-1 text-xs border ${r.is_released ? "border-green-600 text-green-700" : "border-amber-600 text-amber-700"}`}>
                      {r.is_released ? "Liberado" : "Pendiente"}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td className="px-4 py-6 text-gray-500" colSpan={9}>Sin datos.</td></tr>
              )}
            </tbody>
            {totals && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td className="px-4 py-3 font-semibold">Total</td>
                  <td className="px-4 py-3 text-right font-semibold">${fmt.format(totals.income || 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold">${fmt.format(totals.expense || 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold">${fmt.format(totals.adjustments || 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold">${fmt.format(totals.profit || 0)}</td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right font-semibold">${fmt.format(totals.investment_total || 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold">${fmt.format(totals.remaining || 0)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
