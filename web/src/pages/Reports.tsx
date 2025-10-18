import { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

type Row = {
  plate: string;
  owner_name: string | null;
  payment_date: string | null;
  amount: number | null;
};

export default function Reports() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  async function load(nextOffset = 0) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("limit", String(limit));
      params.set("offset", String(nextOffset));

      const rs = await fetch(`${API}/reports/last-payments?` + params.toString());
      if (!rs.ok) throw new Error(await rs.text());
      const json = await rs.json();
      setItems(json.items);
      setTotal(json.total);
      setOffset(nextOffset);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(0); }, []);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Reportes — Último pago por vehículo</h1>

        {/* Filtros */}
        <div className="mb-4 flex gap-2">
          <input
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            placeholder="Buscar por placa o nombre…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            onClick={() => load(0)}
            className="rounded-xl bg-black px-5 py-2.5 font-medium text-white shadow hover:opacity-90"
          >
            Buscar
          </button>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Conductor</th>
                <th className="px-4 py-3 font-semibold">Placa</th>
                <th className="px-4 py-3 font-semibold">Fecha último pago</th>
                <th className="px-4 py-3 font-semibold">Monto último pago</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.plate} className="border-t">
                  <td className="px-4 py-3">{r.owner_name ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">{r.plate}</td>
                  <td className="px-4 py-3">{r.payment_date ?? "—"}</td>
                  <td className="px-4 py-3">{r.amount != null ? "$" + fmtCOP.format(r.amount) : "—"}</td>
                </tr>
              ))}
              {items.length === 0 && !loading && (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={4}>Sin resultados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
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
