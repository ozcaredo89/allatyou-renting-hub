// web/src/pages/AdminAdvances.tsx
import { useEffect, useMemo, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import PlateField from "../components/PlateField";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");
const parseCOP = (s: string) => Number((s || "").replace(/[^\d]/g, "")) || 0;
const roundUpTo100 = (n: number) => Math.ceil((n || 0) / 100) * 100;

type Advance = {
  id: number;
  person_name: string;
  person_type: "driver" | "collaborator";
  driver_id?: number | null;
  plate?: string | null;
  amount: number;
  rate_percent: number;
  installments: number;
  start_date: string; // YYYY-MM-DD
  status: "active" | "closed" | "cancelled";
  notes?: string | null;
  created_at: string;
};

type ScheduleRow = {
  id: number;
  advance_id: number;
  installment_no: number;
  due_date: string;
  installment_amount: number;
  interest_amount: number;
  principal_amount: number;
  paid_date?: string | null;
  status: "pending" | "paid" | "overdue";
  overdue?: boolean; // decorado por backend
};

const badgeTone = (k: string) => {
  switch (k) {
    case "active":
      return "bg-blue-100 text-blue-700";
    case "closed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-gray-200 text-gray-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "paid":
      return "bg-emerald-100 text-emerald-700";
    case "overdue":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

/* =========================
   Create Form
   ========================= */
function CreateAdvanceForm({ onCreated }: { onCreated: (a: Advance) => void }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [f, setF] = useState({
    person_name: "",
    person_type: "driver" as "driver" | "collaborator",
    driver_id: "",
    plate: "",
    amountStr: fmtCOP.format(300000),
    rate_percent: "15",
    installments: "21",
    start_date: today,
    daily_installmentStr: "", // <- formateado (como amountStr)
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Cuota sugerida (redondeada HACIA ARRIBA a centenas)
  const dailyQuotaSuggested = useMemo(() => {
    const amount = parseCOP(f.amountStr);
    const rate = Number(f.rate_percent) || 0; // tasa total del anticipo
    const n = Math.max(1, Number(f.installments) || 1);
    const totalToPay = amount * (1 + rate / 100);
    const raw = Math.round(totalToPay / n) || 0;
    return roundUpTo100(raw);
  }, [f.amountStr, f.rate_percent, f.installments]);

  const onChange = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setOk(null);
    try {
      const auth = ensureBasicAuth();
      const payload: any = {
        person_name: f.person_name.trim(),
        person_type: f.person_type,
        amount: parseCOP(f.amountStr),
        rate_percent: Number(f.rate_percent),
        installments: Number(f.installments),
        start_date: f.start_date,
        // si viene valor manual, usarlo; si no, usar sugerida. En ambos casos redondear a 100
        daily_installment: roundUpTo100(
          f.daily_installmentStr ? parseCOP(f.daily_installmentStr) : dailyQuotaSuggested
        ),
      };
      if (f.driver_id) payload.driver_id = Number(f.driver_id);
      if (f.plate) payload.plate = f.plate.toUpperCase();
      if (f.notes) payload.notes = f.notes.trim();

      const rs = await fetch(`${API}/advances`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(payload),
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      const json = await rs.json();
      if (!rs.ok) throw new Error(json?.error || "Error creando anticipo");
      setOk(`Creado anticipo #${json.advance.id}`);
      onCreated(json.advance);
      setF((s) => ({
        ...s,
        amountStr: fmtCOP.format(300000),
        daily_installmentStr: "",
        notes: "",
      }));
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold">Crear Anticipo Operativo</h3>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Nombre de la persona</label>
          <input
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            value={f.person_name}
            onChange={(e) => onChange("person_name", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tipo</label>
          <select
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            value={f.person_type}
            onChange={(e) => onChange("person_type", e.target.value)}
          >
            <option value="driver">Conductor</option>
            <option value="collaborator">Colaborador</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Driver ID (opcional)</label>
          <input
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            inputMode="numeric"
            value={f.driver_id}
            onChange={(e) => onChange("driver_id", e.target.value)}
            placeholder="123"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Placa (opcional)</label>
          <PlateField
            value={f.plate}
            onChange={(v) => onChange("plate", v)}
            requireAuth
            onDriverResolved={(d) => {
              setF((prev) => ({
                ...prev,
                person_name: prev.person_name || d?.driver_name || prev.person_name,
                person_type: d ? "driver" : prev.person_type,
              }));
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Monto (COP)</label>
          <input
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            inputMode="numeric"
            placeholder="300.000"
            value={f.amountStr}
            onChange={(e) => {
              const onlyDigits = e.target.value.replace(/[^\d]/g, "");
              const n = Number(onlyDigits || "0");
              setF((prev) => ({ ...prev, amountStr: n ? fmtCOP.format(n) : "" }));
            }}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tasa del anticipo (%)</label>
          <input
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            type="number"
            min={0}
            step={0.001}
            value={f.rate_percent}
            onChange={(e) => onChange("rate_percent", e.target.value)}
          />
          <div className="mt-1 text-xs text-gray-500">
            Aplicada sobre el monto para repartir en {f.installments || "21"} cuotas.
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Cuotas</label>
          <input
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            type="number"
            min={1}
            step={1}
            value={f.installments}
            onChange={(e) => onChange("installments", e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Fecha inicio</label>
          <input
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            type="date"
            value={f.start_date}
            onChange={(e) => onChange("start_date", e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Cuota diaria</label>
          <input
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            inputMode="numeric"
            placeholder={fmtCOP.format(dailyQuotaSuggested)}
            value={f.daily_installmentStr || fmtCOP.format(dailyQuotaSuggested)}
            onChange={(e) => {
              const onlyDigits = e.target.value.replace(/[^\d]/g, "");
              const n = Number(onlyDigits || "0");
              setF((prev) => ({
                ...prev,
                daily_installmentStr: n ? fmtCOP.format(n) : "",
              }));
            }}
            required
          />
          <div className="mt-1 text-xs text-gray-500">
            Sugerida: ${fmtCOP.format(dailyQuotaSuggested)} (puedes editarla).
          </div>
        </div>
        <div className="md:col-span-3">
          <label className="mb-1 block text-sm font-medium">Notas</label>
          <textarea
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
            rows={2}
            value={f.notes}
            onChange={(e) => onChange("notes", e.target.value)}
          />
        </div>
        <div className="md:col-span-3 flex items-center gap-3">
          <button
            className="rounded-xl bg-black px-5 py-2.5 font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Creando…" : "Crear anticipo"}
          </button>
          {err && <span className="text-sm text-red-600">{err}</span>}
          {ok && <span className="text-sm text-emerald-700">{ok}</span>}
        </div>
      </form>
    </div>
  );
}

/* =========================
   Schedule Modal (con scroll)
   ========================= */
function ScheduleModal({
  advance,
  open,
  onClose,
}: {
  advance: Advance | null;
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !advance) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const auth = ensureBasicAuth();
        const rs = await fetch(`${API}/advances/${advance.id}/schedule`, {
          headers: { Authorization: auth },
        });
        if (rs.status === 401 || rs.status === 403) {
          clearBasicAuth();
          throw new Error("Unauthorized");
        }
        const json = await rs.json();
        if (!rs.ok) throw new Error(json?.error || "Error cargando cronograma");
        setRows(json.items as ScheduleRow[]);
      } catch (e: any) {
        setErr(e?.message || "Error");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, advance]);

  async function markPaid(row: ScheduleRow) {
    if (!advance) return;
    setPayingId(row.id);
    try {
      const auth = ensureBasicAuth();
      const rs = await fetch(`${API}/advances/${advance.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ installment_no: row.installment_no }),
      });
      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }
      const json = await rs.json();
      if (!rs.ok) throw new Error(json?.error || "No se pudo pagar la cuota");

      // recargar cronograma
      const rs2 = await fetch(`${API}/advances/${advance.id}/schedule`, {
        headers: { Authorization: ensureBasicAuth() },
      });
      const json2 = await rs2.json();
      if (rs2.ok) setRows(json2.items as ScheduleRow[]);
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setPayingId(null);
    }
  }

  if (!open || !advance) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[85vh] rounded-2xl border bg-white shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-semibold">Cronograma — Anticipo #{advance.id}</h3>
          <button className="h-8 w-8 rounded-xl hover:bg-gray-100" onClick={onClose}>✕</button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5">
          {loading ? (
            <div className="py-10 text-center">Cargando…</div>
          ) : err ? (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Vence</th>
                    <th className="px-4 py-2">Cuota</th>
                    <th className="px-4 py-2">Interés</th>
                    <th className="px-4 py-2">Capital</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const state = r.overdue && r.status !== "paid" ? "overdue" : r.status;
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-4 py-2">{r.installment_no}</td>
                        <td className="px-4 py-2">{r.due_date}</td>
                        <td className="px-4 py-2 font-medium">${fmtCOP.format(r.installment_amount)}</td>
                        <td className="px-4 py-2">${fmtCOP.format(r.interest_amount)}</td>
                        <td className="px-4 py-2">${fmtCOP.format(r.principal_amount)}</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-3 py-1 text-xs ${badgeTone(state)}`}>{state}</span>
                        </td>
                        <td className="px-4 py-2">
                          {r.status !== "paid" && (
                            <button
                              className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                              onClick={() => markPaid(r)}
                              disabled={payingId === r.id}
                            >
                              {payingId === r.id ? "Pagando…" : "Marcar pagada"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-gray-500" colSpan={7}>
                        Sin cronograma.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
   Listado + filtros
   ========================= */
function AdvancesList() {
  const [items, setItems] = useState<Advance[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: "", person: "", plate: "" });
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const [selected, setSelected] = useState<Advance | null>(null);

  async function load(nextOffset = 0) {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.person) params.set("person", filters.person);
      if (filters.plate) params.set("plate", filters.plate.toUpperCase());
      params.set("limit", String(limit));
      params.set("offset", String(nextOffset));

      const rs = await fetch(`${API}/advances?${params.toString()}`, {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      const json = await rs.json();
      if (!rs.ok) throw new Error(json?.error || "Error cargando lista");

      setItems(json.items || []);
      setTotal(json.total || 0);
      setOffset(nextOffset);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line
  }, []);

  const canPrev = offset > 0 && !loading;
  const canNext = offset + limit < total && !loading;

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    load(0);
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <h3 className="text-lg font-semibold">Anticipos</h3>
        <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-700">Estado</label>
            <select
              className="h-10 w-40 rounded-xl border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-black/60"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">Todos</option>
              <option value="active">Activos</option>
              <option value="closed">Cerrados</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-700">Persona</label>
            <input
              className="h-10 w-48 rounded-xl border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-black/60"
              placeholder="Nombre"
              value={filters.person}
              onChange={(e) => setFilters({ ...filters, person: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-700">Placa</label>
            <input
              className="h-10 w-36 rounded-xl border border-gray-300 bg-white px-3 uppercase outline-none focus:ring-2 focus:ring-black/60"
              placeholder="ABC123"
              value={filters.plate}
              onChange={(e) => setFilters({ ...filters, plate: e.target.value })}
            />
          </div>
          <button className="h-10 rounded-xl bg-black px-4 text-sm font-medium text-white shadow hover:opacity-90">
            Filtrar
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Persona</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Placa</th>
              <th className="px-4 py-3">Monto</th>
              <th className="px-4 py-3">Tasa (%)</th>
              <th className="px-4 py-3">Cuotas</th>
              <th className="px-4 py-3">Inicio</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-center" colSpan={10}>
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500" colSpan={10}>
                  Sin resultados.
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3">{a.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.person_name}</div>
                    {a.notes && (
                      <div className="max-w-[260px] truncate text-xs text-gray-500">{a.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="rounded-full bg-gray-100 px-2 py-1">{a.person_type}</span>
                  </td>
                  <td className="px-4 py-3">{a.plate || "—"}</td>
                  <td className="px-4 py-3">${fmtCOP.format(a.amount)}</td>
                  <td className="px-4 py-3">{a.rate_percent}%</td>
                  <td className="px-4 py-3">{a.installments}</td>
                  <td className="px-4 py-3">{a.start_date}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs ${badgeTone(a.status)}`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => setSelected(a)}
                    >
                      Cronograma
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {items.length > 0
            ? `Mostrando ${offset + 1}–${Math.min(offset + limit, total)} de ${total}`
            : `Mostrando 0 de ${total}`}
        </div>
        <div className="flex gap-2">
          <button
            disabled={!canPrev}
            onClick={() => load(Math.max(0, offset - limit))}
            className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            disabled={!canNext}
            onClick={() => load(offset + limit)}
            className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>

      <ScheduleModal advance={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* =========================
   Page wrapper
   ========================= */
export default function AdminAdvances() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold tracking-tight">Anticipos Operativos</h1>
          <p className="text-sm text-gray-600">Crear, listar, ver cronograma y marcar pagos.</p>
        </div>

        <CreateAdvanceForm onCreated={() => setRefreshKey((k) => k + 1)} />
        {/* re-montar lista al crear */}
        <div key={refreshKey}>
          <AdvancesList />
        </div>
      </div>
    </div>
  );
}