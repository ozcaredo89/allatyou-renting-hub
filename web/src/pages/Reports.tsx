import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";

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

export default function Reports() {
  const todayYm = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [month, setMonth] = useState<string>(todayYm);
  const [q, setQ] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

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
                <th className="px-4 py-3 font-semibold">Conductor</th>
                <th className="px-4 py-3 font-semibold">Placa</th>
                <th className="px-4 py-3 font-semibold">Fecha último pago</th>
                <th className="px-4 py-3 font-semibold">Monto último pago</th>
                <th className="px-4 py-3 font-semibold">Cuota #</th> 
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const overdue = r.is_overdue === true;
                const color = overdue ? "text-red-600" : "";

                return (
                  <tr key={r.plate} className="border-t">
                    <td className={`px-4 py-3 ${overdue ? "font-medium " + color : ""}`}>
                      {r.owner_name ?? "—"}
                    </td>
                    <td className={`px-4 py-3 font-medium ${color}`}>{r.plate}</td>
                    <td className={`px-4 py-3 ${color}`}>{r.payment_date ?? "—"}</td>
                    <td className={`px-4 py-3 ${color}`}>
                      {r.amount != null ? "$" + fmtCOP.format(r.amount) : "—"}
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
                  </tr>
                );
              })}
              {items.length === 0 && !loading && (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={6}>
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
