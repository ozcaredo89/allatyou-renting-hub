// web/src/pages/RemindersLog.tsx
import { useEffect, useMemo, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type LogRow = {
  id: number;
  created_at: string;
  plate: string;
  subscription_id: number | null;
  channel: "email" | "whatsapp";
  to_value: string;
  reason_types: string[]; // ['soat','tecno','pico']
  subject: string | null;
  body_preview: string | null;
  status: "sent" | "skipped" | "error";
  error_message: string | null;
  run_id: string | null;
  run_hour: number | null;
  run_date: string | null; // YYYY-MM-DD
};

const badgeTone = (k: string) => {
  switch (k) {
    case "sent":
      return "bg-emerald-100 text-emerald-700";
    case "skipped":
      return "bg-amber-100 text-amber-700";
    case "error":
      return "bg-red-100 text-red-700";
    case "email":
      return "bg-blue-100 text-blue-700";
    case "whatsapp":
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

function normalizePlate(s: string) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function safeDateTime(s: string) {
  try {
    return new Date(s).toLocaleString("es-CO");
  } catch {
    return s;
  }
}

export default function RemindersLog() {
  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    plate: "",
    channel: "" as "" | "email" | "whatsapp",
    status: "" as "" | "sent" | "skipped" | "error",
    reason: "" as "" | "soat" | "tecno" | "pico",
    limit: 200,
  });

  const plateNorm = useMemo(() => normalizePlate(filters.plate), [filters.plate]);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const auth = ensureBasicAuth();
      const params = new URLSearchParams();
      params.set("limit", String(filters.limit || 200));
      if (plateNorm) params.set("plate", plateNorm);
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.status) params.set("status", filters.status);
      if (filters.reason) params.set("reason", filters.reason);

      // Requiere que tu backend exponga: GET /reminders/log con BasicAuth (igual que admin)
      const rs = await fetch(`${API}/reminders/log?${params.toString()}`, {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      const json = await rs.json();
      if (!rs.ok) throw new Error(json?.error || "Error cargando log");

      setItems((json.items || []) as LogRow[]);
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold tracking-tight">Log de Recordatorios</h1>
          <p className="text-sm text-gray-600">
            Historial de envíos (Email / WhatsApp) generado por el cron de reminders.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <h3 className="text-lg font-semibold">Filtros</h3>

            <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-700">Placa</label>
                <input
                  className="h-10 w-36 rounded-xl border border-gray-300 bg-white px-3 uppercase outline-none focus:ring-2 focus:ring-black/60"
                  placeholder="ABC123"
                  value={filters.plate}
                  onChange={(e) => setFilters((s) => ({ ...s, plate: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-700">Canal</label>
                <select
                  className="h-10 w-40 rounded-xl border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-black/60"
                  value={filters.channel}
                  onChange={(e) =>
                    setFilters((s) => ({ ...s, channel: e.target.value as any }))
                  }
                >
                  <option value="">Todos</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-700">Estado</label>
                <select
                  className="h-10 w-40 rounded-xl border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-black/60"
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((s) => ({ ...s, status: e.target.value as any }))
                  }
                >
                  <option value="">Todos</option>
                  <option value="sent">sent</option>
                  <option value="skipped">skipped</option>
                  <option value="error">error</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-700">Reason</label>
                <select
                  className="h-10 w-40 rounded-xl border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-black/60"
                  value={filters.reason}
                  onChange={(e) =>
                    setFilters((s) => ({ ...s, reason: e.target.value as any }))
                  }
                >
                  <option value="">Todos</option>
                  <option value="soat">soat</option>
                  <option value="tecno">tecno</option>
                  <option value="pico">pico</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-700">Límite</label>
                <select
                  className="h-10 w-28 rounded-xl border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-black/60"
                  value={String(filters.limit)}
                  onChange={(e) =>
                    setFilters((s) => ({ ...s, limit: Number(e.target.value) }))
                  }
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="500">500</option>
                </select>
              </div>

              <button
                className="h-10 rounded-xl bg-black px-4 text-sm font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "Cargando…" : "Buscar"}
              </button>
            </form>
          </div>

          {err && (
            <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Placa</th>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Reasons</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Run</th>
                  <th className="px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-center" colSpan={8}>
                      Cargando…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-gray-500" colSpan={8}>
                      Sin resultados.
                    </td>
                  </tr>
                ) : (
                  items.map((x) => (
                    <tr key={x.id} className="border-t align-top">
                      <td className="px-4 py-3 whitespace-nowrap">{safeDateTime(x.created_at)}</td>
                      <td className="px-4 py-3 font-medium">{x.plate}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs ${badgeTone(x.channel)}`}>
                          {x.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[240px] truncate">{x.to_value}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(x.reason_types || []).length ? (
                            x.reason_types.map((r) => (
                              <span
                                key={r}
                                className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                              >
                                {r}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs ${badgeTone(x.status)}`}>
                          {x.status}
                        </span>
                        {x.status === "error" && x.error_message && (
                          <div className="mt-2 max-w-[280px] text-xs text-red-700">
                            {x.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        <div>{x.run_date || "—"}</div>
                        <div>hour: {typeof x.run_hour === "number" ? x.run_hour : "—"}</div>
                        <div className="text-gray-500 truncate max-w-[160px]">
                          {x.run_id || ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {x.subject ? (
                          <div className="max-w-[320px]">
                            <div className="text-xs text-gray-500">Subject</div>
                            <div className="truncate">{x.subject}</div>
                          </div>
                        ) : (
                          <div className="text-gray-500">—</div>
                        )}
                        {x.body_preview && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-gray-700 hover:underline">
                              Ver body preview
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap rounded-xl border bg-gray-50 p-3 text-xs text-gray-800">
                              {x.body_preview}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            Nota: esta página asume que el backend expone <code>GET /reminders/log</code> protegido
            con BasicAuth (mismo patrón de admin).
          </div>
        </div>
      </div>
    </div>
  );
}
