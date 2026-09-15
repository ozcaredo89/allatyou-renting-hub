import { useEffect, useState } from "react";
import { X, Search, Loader2, Download, Landmark, RefreshCw } from "lucide-react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

type BankTransaction = {
  id: number;
  fecha: string | null;
  descripcion: string | null;
  referencia: string | null;
  monto_entrada: number | null;
  sucursal: string | null;
  moneda: string | null;
  created_at: string;
};

interface BankReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Referencia a buscar de una (ej. al abrir desde el badge "Conciliado"
   * de un pago). Amplía el rango de fechas por si el movimiento es viejo. */
  initialQuery?: string | null;
}

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function wideFromDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

export function BankReconciliationModal({ isOpen, onClose, initialQuery }: BankReconciliationModalProps) {
  const [items, setItems] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(defaultFromDate());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  async function load(overrideQ?: string, overrideFrom?: string) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const effectiveQ = overrideQ ?? q;
      const effectiveFrom = overrideFrom ?? from;
      const params = new URLSearchParams();
      if (effectiveQ.trim()) params.set("q", effectiveQ.trim());
      if (effectiveFrom) params.set("from", effectiveFrom);
      if (to) params.set("to", to);

      let auth = ensureBasicAuth();
      let rs = await fetch(`${API}/reports/bank-transactions?` + params.toString(), {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        auth = ensureBasicAuth();
        rs = await fetch(`${API}/reports/bank-transactions?` + params.toString(), {
          headers: { Authorization: auth },
        });
      }

      if (!rs.ok) throw new Error(await rs.text());

      const json = await rs.json();
      setItems(json.items || []);
    } catch (e: any) {
      setErrorMsg(e?.message || "Error cargando movimientos bancarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    if (initialQuery) {
      const wideFrom = wideFromDate();
      setQ(initialQuery);
      setFrom(wideFrom);
      load(initialQuery, wideFrom);
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialQuery]);

  function downloadCsv() {
    const header = ["Fecha", "Descripcion", "Referencia", "Monto", "Sucursal"];
    const rows = items.map((it) => [
      it.fecha ?? "",
      (it.descripcion ?? "").replace(/"/g, '""'),
      it.referencia ?? "",
      it.monto_entrada ?? "",
      it.sucursal ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `movimientos_bancarios_${from}_a_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = items.reduce((acc, it) => acc + (it.monto_entrada ?? 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <Landmark className="w-6 h-6 text-emerald-400" />
            <div>
              <h2 className="text-xl font-bold">Conciliación bancaria</h2>
              <p className="text-xs text-slate-400">
                Movimientos entrantes extraídos por bank-sync, para cruzar contra comprobantes de pago.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white cursor-pointer">
            <X />
          </button>
        </div>

        {/* Filtros */}
        <div className="p-4 border-b bg-slate-50 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por descripción, referencia o sucursal…"
              className="w-full h-10 rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-xl border border-gray-300 bg-white px-2 text-sm outline-none focus:border-black"
            />
            <span className="text-xs text-gray-400">a</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-xl border border-gray-300 bg-white px-2 text-sm outline-none focus:border-black"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>Filtrar</span>
            </button>
            <button
              onClick={downloadCsv}
              disabled={items.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-gray-300 px-3.5 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              title="Descargar esta vista en CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="mb-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
              {errorMsg}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Descripción</th>
                  <th className="text-left px-3 py-2">Referencia</th>
                  <th className="text-left px-3 py-2">Sucursal</th>
                  <th className="text-right px-3 py-2">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{it.fecha}</td>
                    <td className="px-3 py-2 text-gray-800">{it.descripcion}</td>
                    <td className="px-3 py-2 text-gray-500 font-mono text-xs">{it.referencia}</td>
                    <td className="px-3 py-2 text-gray-500">{it.sucursal}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">
                      {it.monto_entrada != null ? `$${fmtCOP.format(it.monto_entrada)}` : "—"}
                    </td>
                  </tr>
                ))}

                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                      No hay movimientos en este rango.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-slate-50 flex items-center justify-between text-sm">
          <span className="text-gray-500">{items.length} movimientos</span>
          <span className="font-bold text-gray-900">Total: ${fmtCOP.format(total)}</span>
        </div>
      </div>
    </div>
  );
}
