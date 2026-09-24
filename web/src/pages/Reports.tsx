import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Trash2,
  Search,
  X,
  Download,
  Calendar,
  AlertTriangle,
  Clock,
  Car,
  Loader2,
  RotateCcw,
  Landmark,
  CheckCircle2,
  CreditCard,
} from "lucide-react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { useSortableData } from "../hooks/useSortableData";
import {
  ReceiptBadge,
  type DuplicatePaymentSummary,
  type MatchContext,
  type AmountMismatchDetails,
} from "../components/ReceiptBadge";
import { BankReconciliationModal } from "../components/BankReconciliationModal";
import { ReconciliationBadge, type BankMatch } from "../components/ReconciliationBadge";
import { AdvancePaymentModal } from "../components/AdvancePaymentModal";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

type Row = {
  plate: string;
  owner_name: string | null;
  payment_date: string | null;
  payment_created_at?: string | null;
  amount: number | null;
  days_since: number;
  is_overdue: boolean;
  installment_number: number | null;
  proof_url: string | null;
  status?: 'active' | 'maintenance' | 'sold' | 'inactive';
  // Receipt classification (from backend classifyReceipt)
  is_suspicious: boolean;
  is_technical_failure: boolean;
  inconsistency_reasons: string[];
  duplicate_payments?: DuplicatePaymentSummary[];
  match_context?: MatchContext | null;
  amount_mismatch?: AmountMismatchDetails | null;
  payment_id?: number | null;
  bank_match?: BankMatch | null;
  receipt_status?: string | null;
  flag_details?: any | null;
};

function formatRegistrationTime(isoStr?: string | null): string | null {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
}


type Payment = {
  id: number;
  payer_name: string;
  plate: string;
  payment_date: string;          // YYYY-MM-DD
  amount: number;
  installment_number: number | null;
  proof_url: string | null;
  status: "pending" | "confirmed" | "rejected";
  receipt_status: string | null;
  flag_reason: string | null;
  is_suspicious: boolean;
  is_technical_failure: boolean;
  inconsistency_reasons: string[];
  duplicate_payments?: DuplicatePaymentSummary[];
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
  const [onlySuspicious, setOnlySuspicious] = useState(false);
  const [showInactive, setShowInactive] = useState(true);
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankModalQuery, setBankModalQuery] = useState<string | null>(null);
  const [advanceModalRow, setAdvanceModalRow] = useState<Row | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const limit = 20;

  function openBankModalFor(referencia: string) {
    setBankModalQuery(referencia);
    setShowBankModal(true);
  }

  async function handleReconcile() {
    setReconciling(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/reports/reconcile-bank`, {
        method: "POST",
        headers: { Authorization: auth },
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      alert(
        `Conciliación completa.\n\nPagos revisados: ${json.checked}\n` +
          `Conciliados ahora: ${json.reconciled}\n` +
          `Ambiguos (más de un movimiento igual, sin tocar): ${json.ambiguous}`
      );
      load(offset);
    } catch (e: any) {
      alert(`Error al conciliar: ${e.message}`);
    } finally {
      setReconciling(false);
    }
  }

  const { items: sortedItems, requestSort, sortConfig } = useSortableData(items);
  const visibleItems = sortedItems;

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

  const isMounted = useRef(false);

  async function load(
    nextOffset = 0,
    searchQuery = q,
    isOverdue = onlyOverdue,
    isSuspicious = onlySuspicious,
    withInactive = showInactive
  ) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      const trimmed = searchQuery.trim();
      if (trimmed) params.set("q", trimmed);
      if (isOverdue)    params.set("overdue_only",    "true");
      if (isSuspicious) params.set("suspicious_only", "true");
      if (!withInactive) params.set("include_inactive", "false");
      params.set("limit",  String(limit));
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

  // Búsqueda en tiempo real con debounce: al teclear o cambiar filtros, espera 300ms y filtra automáticamente
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      load(0, q, onlyOverdue, onlySuspicious, showInactive);
      return;
    }

    const timer = setTimeout(() => {
      load(0, q, onlyOverdue, onlySuspicious, showInactive);
    }, 300);

    return () => clearTimeout(timer);
  }, [q, onlyOverdue, onlySuspicious, showInactive]);

  const handleClearSearch = () => {
    setQ("");
    load(0, "", onlyOverdue, onlySuspicious, showInactive);
  };

  const handleResetFilters = () => {
    setQ("");
    setOnlyOverdue(false);
    setOnlySuspicious(false);
    setShowInactive(true);
    load(0, "", false, false, true);
  };

  const hasActiveFilters = Boolean(q.trim() || onlyOverdue || onlySuspicious || !showInactive);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  // Formatea flag_details (duplicados) como texto legible
  // para un auditor externo, sin que necesite consultar la base de datos.
  function formatDetalleInconsistencias(p: Payment): string {
    const parts: string[] = [];

    if (p.duplicate_payments && p.duplicate_payments.length > 0) {
      const dupText = p.duplicate_payments
        .map((d) => {
          const amountText = d.amount != null ? `$${fmtCOP.format(d.amount)}` : "—";
          let entry = `Placa ${d.plate} (${d.payment_date ?? "—"}, ${amountText}`;
          if (d.reference_number) entry += `, Ref: ${d.reference_number}`;
          entry += ")";
          return entry;
        })
        .join("; ");
      parts.push(`Duplicado con pago(s): ${dupText}`);
    }

    if (parts.length === 0) {
      // Huérfano sin datos estructurados: degradamos al texto plano existente.
      return (p.inconsistency_reasons ?? []).join(" | ");
    }

    return parts.join(" | ");
  }

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
        "EstadoComprobante",
        "Inconsistencias",
        "DetalleInconsistencias",
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
          p.receipt_status ?? "",
          (p.inconsistency_reasons ?? []).join(" | "),
          formatDetalleInconsistencias(p),
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
    <div className="min-h-screen p-4 sm:p-6 bg-gray-50/50">
      <div className="mx-auto max-w-7xl">
        {/* Header: título arriba, barra de acciones abajo (envuelve en líneas
            si no cabe, en vez de desbordarse fuera de la pantalla) */}
        <div className="mb-6 space-y-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
              Reportes — Último pago por vehículo
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Consulta en tiempo real el estado de recaudo, morosidad y comprobantes de la flota.
            </p>
          </div>

          {/* Cada control es un chip independiente: envuelve libremente en
              varias líneas en vez de forzar el ancho de la pantalla. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200/90 shadow-xs rounded-2xl px-3 py-2 shrink-0">
              <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-xs font-medium text-gray-600 hidden md:inline whitespace-nowrap">Exportar mes:</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg bg-gray-50 border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-black/60 cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={downloadCsv}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-black px-3.5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-all cursor-pointer shrink-0 whitespace-nowrap"
              title="Descargar pagos del mes en CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar CSV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setBankModalQuery(null);
                setShowBankModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-all cursor-pointer shrink-0 whitespace-nowrap"
              title="Ver movimientos bancarios para conciliación"
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>Conciliación bancaria</span>
            </button>

            <button
              type="button"
              onClick={handleReconcile}
              disabled={reconciling}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-emerald-700 shadow-xs hover:bg-emerald-50 disabled:opacity-50 transition-all cursor-pointer shrink-0 whitespace-nowrap"
              title="Cruzar pagos sin conciliar contra movimientos bancarios sin reclamar (misma fecha y monto exactos)"
            >
              {reconciling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Conciliar ahora</span>
            </button>
          </div>
        </div>

        <BankReconciliationModal
          isOpen={showBankModal}
          onClose={() => setShowBankModal(false)}
          initialQuery={bankModalQuery}
        />

        <AdvancePaymentModal
          isOpen={!!advanceModalRow}
          onClose={() => setAdvanceModalRow(null)}
          plate={advanceModalRow?.plate ?? null}
          ownerName={advanceModalRow?.owner_name}
          onSuccess={() => {
            setAdvanceModalRow(null);
            load(offset);
          }}
        />

        {/* Barra principal de búsqueda y filtros interactivos */}
        <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Input de búsqueda amplio en tiempo real */}
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                className="w-full h-11 rounded-xl border border-gray-300 bg-white pl-10 pr-10 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black/10 shadow-xs"
                placeholder="Escribe para filtrar por placa o conductor en tiempo real…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    load(0, q, onlyOverdue, onlySuspicious, showInactive);
                  }
                }}
              />
              {/* Spinner de búsqueda o botón limpiar búsqueda */}
              {loading ? (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                </div>
              ) : q ? (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  title="Limpiar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            {/* Chips de filtro rápido */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyOverdue(!onlyOverdue)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  onlyOverdue
                    ? "bg-red-50 text-red-700 border-red-300 shadow-xs"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <Clock className={`w-3.5 h-3.5 ${onlyOverdue ? "text-red-600" : "text-gray-400"}`} />
                <span>Solo en mora</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlySuspicious(!onlySuspicious)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  onlySuspicious
                    ? "bg-amber-50 text-amber-800 border-amber-300 shadow-xs"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <AlertTriangle className={`w-3.5 h-3.5 ${onlySuspicious ? "text-amber-600" : "text-gray-400"}`} />
                <span>Con inconsistencias</span>
              </button>

              <button
                type="button"
                onClick={() => setShowInactive(!showInactive)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  showInactive
                    ? "bg-slate-100 text-slate-800 border-slate-300 shadow-xs"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <Car className={`w-3.5 h-3.5 ${showInactive ? "text-slate-700" : "text-gray-400"}`} />
                <span>Incluir inactivos/vendidos</span>
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-500 hover:text-black transition-colors cursor-pointer"
                  title="Restablecer todos los filtros"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>
          </div>

          {/* Subbarra de estado de resultados */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-2 flex-wrap">
              <span>
                {total > 0
                  ? `Mostrando ${offset + 1}–${Math.min(offset + limit, total)} de ${total} vehículos`
                  : "No se encontraron vehículos"}
              </span>
              {q.trim() && (
                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-[11px]">
                  Buscando: <strong className="font-semibold">"{q.trim()}"</strong>
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="hover:text-black ml-0.5 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>

            {loading && (
              <span className="inline-flex items-center gap-1 text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Filtrando...
              </span>
            )}
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
                      <td className={`px-4 py-3 ${color}`}>
                        <div className="font-medium">{r.payment_date ?? "—"}</div>
                        {r.payment_created_at && (
                          <div
                            className="text-[11px] text-gray-500 font-normal cursor-help inline-flex items-center gap-1 mt-0.5 hover:text-gray-700 transition-colors"
                            title={`Hora en que se registró en el sistema: ${new Date(r.payment_created_at).toLocaleString("es-CO")}\n(Nota: Corresponde al registro en la plataforma, no a la hora del comprobante bancario)`}
                          >
                            <span>Reg: {formatRegistrationTime(r.payment_created_at)}</span>
                          </div>
                        )}
                      </td>
                    <td className={`px-4 py-3 ${color}`}>
                      <div className="flex items-center gap-2 flex-wrap">
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
                        <ReceiptBadge
                          is_suspicious={r.is_suspicious ?? false}
                          is_technical_failure={r.is_technical_failure ?? false}
                          reasons={r.inconsistency_reasons ?? []}
                          duplicatePayments={r.duplicate_payments}
                          matchContext={r.match_context}
                          amountMismatch={r.amount_mismatch}
                          current={{
                            plate: r.plate,
                            payment_date: r.payment_date,
                            amount: r.amount,
                            proof_url: r.proof_url,
                          }}
                        />
                        {r.payment_date && r.amount != null && (
                          <ReconciliationBadge
                            bankMatch={r.bank_match}
                            onViewInBankModal={openBankModalFor}
                            receiptStatus={r.receipt_status}
                            flagDetails={r.flag_details}
                          />
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-3 ${color}`}>
                      {r.installment_number != null ? `#${r.installment_number}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {overdue ? (
                          <>
                            <span className="rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-semibold">
                              En mora ({r.days_since} días)
                            </span>
                            <button
                              type="button"
                              onClick={() => setAdvanceModalRow(r)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer whitespace-nowrap"
                              title={`Pagar mora con anticipo para la placa ${r.plate}`}
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Pagar con anticipo</span>
                            </button>
                          </>
                        ) : (
                          <span className="rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-xs">
                            Al día
                          </span>
                        )}
                      </div>
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
                  <td className="px-4 py-12 text-center text-gray-500" colSpan={7}>
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search className="w-8 h-8 text-gray-300 stroke-1" />
                      <p className="font-medium text-gray-700">No se encontraron vehículos</p>
                      <p className="text-xs text-gray-400">
                        {hasActiveFilters
                          ? "Intenta ajustar o limpiar los filtros de búsqueda."
                          : "No hay registros disponibles en este momento."}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-2 text-xs font-semibold text-black underline hover:opacity-80 cursor-pointer"
                        >
                          Restablecer todos los filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación para la vista de últimos pagos */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-sm text-gray-500 font-medium">
            {total > 0
              ? `Mostrando ${offset + 1}–${Math.min(offset + limit, total)} de ${total} registros`
              : `0 registros`}
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={!canPrev || loading}
              onClick={() => load(Math.max(0, offset - limit), q, onlyOverdue, onlySuspicious, showInactive)}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Anterior
            </button>
            <button
              disabled={!canNext || loading}
              onClick={() => load(offset + limit, q, onlyOverdue, onlySuspicious, showInactive)}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
