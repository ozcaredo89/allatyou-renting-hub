import { useEffect, useState } from "react";
import { ExternalLink, ArrowUp, ArrowDown, ChevronsUpDown, Trash2 } from "lucide-react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { useSortableData } from "../hooks/useSortableData";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

type Row = {
  plate: string;
  owner_name: string | null;
  payment_date: string | null;
  amount: number | null;
  days_since: number;
  is_overdue: boolean;
  installment_number: number | null;
  proof_url: string | null;
  status?: 'active' | 'maintenance' | 'sold' | 'inactive';
};


type Payment = {
  id: number;
  payer_name: string;
  plate: string;
  payment_date: string;          // YYYY-MM-DD
  amount: number;
  installment_number: number | null;
  proof_url: string | null;
  status: "pending" | "confirmed" | "rejected";
};

const StatusBadge = ({ status }: { status?: string }) => {
  if (status === 'maintenance') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">Mantenimiento</span>;
  if (status === 'sold') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300">Vendido</span>;
  if (status === 'inactive') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">Inactivo</span>;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Activo</span>;
};

export default function Reports() {
  const todayYm = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [month, setMonth] = useState<string>(todayYm);
  const [q, setQ] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [showInactive, setShowInactive] = useState(true);
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { items: sortedItems, requestSort, sortConfig } = useSortableData(items);
  const visibleItems = showInactive ? sortedItems : sortedItems.filter(r => r.status !== 'sold' && r.status !== 'inactive');

  async function handleDeleteLastPayment(plate: string) {
    if (!window.confirm(`⚠️ ¿Estás seguro de deshacer el último pago de la placa ${plate}? Esta acción no se puede revertir.`)) {
      return;
    }

    try {
      setLoading(true);
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/payments/last/${plate}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Error al eliminar el pago");
      }

      alert("Pago deshecho correctamente.");
      load(offset);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig?.key !== columnKey) {
      return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="w-3 h-3" />
    ) : (
      <ArrowDown className="w-3 h-3" />
    );
  };

  async function load(nextOffset = 0) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (onlyOverdue) params.set("overdue_only", "true");
      params.set("limit", String(limit));
      params.set("offset", String(nextOffset));

      let auth = ensureBasicAuth();
      let rs = await fetch(`${API}/reports/last-payments?` + params.toString(), {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        auth = ensureBasicAuth();
        rs = await fetch(`${API}/reports/last-payments?` + params.toString(), {
          headers: { Authorization: auth },
        });
      }

      if (!rs.ok) throw new Error(await rs.text());

      const json = await rs.json();
      setItems(json.items || []);
      setTotal(json.total ?? (json.items?.length ?? 0));
      setOffset(nextOffset);
    } catch (e: any) {
      setErrorMsg(e?.message || "Error cargando reportes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
  }, []);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  // ===== Descargar CSV de TODOS los pagos de un mes =====
  async function downloadCsv() {
    setErrorMsg(null);

    if (!month) {
      alert("Selecciona un mes antes de descargar el CSV.");
      return;
    }

    // month viene en formato YYYY-MM gracias al <input type="month" />
    const monthRe = /^\d{4}-\d{2}$/;
    if (!monthRe.test(month)) {
      alert("Mes inválido. Usa un valor de mes válido (YYYY-MM).");
      return;
    }

    setLoading(true);
    try {
      // Traer muchos pagos de golpe (endpoint de pagos crudos)
      const params = new URLSearchParams();
      params.set("month", month);
      params.set("limit", "10000");
      params.set("offset", "0");

      const rs = await fetch(`${API}/payments?` + params.toString());
      if (!rs.ok) throw new Error(await rs.text());

      const json = await rs.json();
      const rows: Payment[] = json.items ?? [];

      // Construir CSV
      const header = [
        "Id",
        "Conductor",
        "Placa",
        "FechaPago",
        "Monto",
        "CuotaNumero",
        "Estado",
        "ComprobanteURL",
      ];

      const lines = rows.map((p) => {
        const cols = [
          String(p.id),
          p.payer_name ?? "",
          p.plate ?? "",
          p.payment_date ?? "",
          p.amount != null ? String(p.amount) : "",
          p.installment_number != null ? String(p.installment_number) : "",
          p.status ?? "",
          p.proof_url ?? "",
        ];

        return cols
          .map((v) => {
            const s = v ?? "";
            return s.includes(",") || s.includes('"')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(",");
      });

      const csv = [header.join(","), ...lines].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pagos-mes-${month}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErrorMsg(e?.message || "Error generando CSV");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">
          Reportes — Último pago por vehículo
        </h1>

        {/* Filtros + acciones */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex-1 flex gap-2">
              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
                placeholder="Buscar por placa o nombre…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                onClick={() => load(0)}
                className="rounded-xl bg-black px-5 py-2.5 font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
                disabled={loading}
              >
                Buscar
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-700 md:text-sm">Mes para exportar:</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/60"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={onlyOverdue}
                onChange={(e) => {
                  setOnlyOverdue(e.target.checked);
                  load(0);
                }}
              />
              Mostrar solo en mora
            </label>

            <button
              type="button"
              onClick={downloadCsv}
              disabled={loading}
              className="mt-1 md:mt-0 rounded-xl border px-4 py-2 text-sm shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Descargar CSV por mes
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors shadow-sm w-max">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
            />
            Incluir vehículos inactivos/vendidos
          </label>
        </div>

        {/* Errores */}
        {errorMsg && (
          <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Tabla (sigue siendo “último pago por placa”) */}
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  <div onClick={() => requestSort('owner_name')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                    Conductor <SortIcon columnKey="owner_name" />
                  </div>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <div onClick={() => requestSort('plate')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                    Placa <SortIcon columnKey="plate" />
                  </div>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <div onClick={() => requestSort('payment_date')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                    Fecha último pago <SortIcon columnKey="payment_date" />
                  </div>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <div onClick={() => requestSort('amount')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                    Monto último pago <SortIcon columnKey="amount" />
                  </div>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <div onClick={() => requestSort('installment_number')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                    Cuota # <SortIcon columnKey="installment_number" />
                  </div>
                </th> 
                <th className="px-4 py-3 font-semibold">
                  <div onClick={() => requestSort('days_since')} className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors w-max">
                    Estado <SortIcon columnKey="days_since" />
                  </div>
                </th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((r) => {
                const overdue = r.is_overdue === true;
                const color = overdue ? "text-red-600" : "";

                return (
                    <tr key={r.plate} className="border-t">
                      <td className={`px-4 py-3 ${overdue ? "font-medium " + color : ""}`}>
                        {r.owner_name ?? "—"}
                      </td>
                      <td className={`px-4 py-3 font-medium ${color}`}>
                        <div className="flex items-center gap-2">
                          {r.plate}
                          <StatusBadge status={r.status} />
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${color}`}>{r.payment_date ?? "—"}</td>
                    <td className={`px-4 py-3 ${color}`}>
                      {r.amount != null ? (
                        r.proof_url ? (
                          <a
                            href={r.proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 underline hover:text-black transition-colors"
                            title="Ver comprobante"
                          >
                            {"$" + fmtCOP.format(r.amount)}
                            <ExternalLink size={14} />
                          </a>
                        ) : (
                          "$" + fmtCOP.format(r.amount)
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`px-4 py-3 ${color}`}>
                      {r.installment_number != null ? `#${r.installment_number}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {overdue ? (
                        <span className="rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs">
                          En mora ({r.days_since} días)
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-xs">
                          Al día
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.payment_date && (
                        <button
                          onClick={() => handleDeleteLastPayment(r.plate)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          title="Deshacer último pago"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleItems.length === 0 && !loading && (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={7}>
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación para la vista de últimos pagos */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {items.length > 0
              ? `Mostrando ${offset + 1}–${Math.min(offset + limit, total)} de ${total}`
              : `Mostrando 0 de ${total}`}
          </div>
          <div className="flex gap-2">
            <button
              disabled={!canPrev || loading}
              onClick={() => load(Math.max(0, offset - limit))}
              className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              disabled={!canNext || loading}
              onClick={() => load(offset + limit)}
              className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
