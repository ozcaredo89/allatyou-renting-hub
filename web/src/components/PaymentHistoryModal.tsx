import { useEffect, useState } from "react";
import { X, Loader2, ExternalLink, CheckCircle2, History, AlertTriangle } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

type HistoryPayment = {
  id: number;
  payment_date: string;
  amount: number;
  status: "pending" | "confirmed" | "rejected" | string;
  installment_number: number | null;
  credit_installment_amount: number | null;
  receipt_status: string | null;
  proof_url: string | null;
  notes?: string | null;
  inconsistency_reasons?: string[] | null;
  amount_mismatch?: { db_amount: number; ocr_amount: number; difference: number } | null;
};

interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  plate: string | null;
  ownerName?: string | null;
  /** Abre el modal de aprobación para un pago pendiente del historial */
  onApprove: (paymentId: number) => void;
  /** Cambia cuando se aprueba un pago, para recargar el historial */
  refreshKey?: number;
  /** Abrir mostrando solo los pagos pendientes (con opción de ver el historial completo) */
  pendingOnly?: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Aprobado",
  pending: "Pendiente",
  rejected: "Rechazado",
};

export function PaymentHistoryModal({ isOpen, onClose, plate, ownerName, onApprove, refreshKey = 0, pendingOnly = false }: PaymentHistoryModalProps) {
  const [items, setItems] = useState<HistoryPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPendingOnly, setShowPendingOnly] = useState(pendingOnly);

  // Cada vez que se abre, arranca en el modo pedido (solo pendientes o historial completo)
  useEffect(() => {
    if (isOpen) setShowPendingOnly(pendingOnly);
  }, [isOpen, plate, pendingOnly]);

  useEffect(() => {
    if (!isOpen || !plate) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`${API}/payments?plate=${encodeURIComponent(plate)}&limit=60`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Error cargando el historial");
        if (alive) setItems(Array.isArray(json.items) ? json.items : []);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [isOpen, plate, refreshKey]);

  if (!isOpen) return null;

  const pendingCount = items.filter((p) => p.status === "pending").length;
  const rows = showPendingOnly ? items.filter((p) => p.status === "pending") : items;

  return (
    // z-[60]: por encima del menú lateral (z-50). En celular ocupa toda la pantalla.
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gray-100 rounded-xl">
              <History className="w-5 h-5 text-gray-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-black text-white font-mono text-xs rounded-md">{plate}</span>
                {showPendingOnly ? "Pagos pendientes" : "Historial de pagos"}
              </h2>
              <p className="text-xs text-gray-500">
                {ownerName || "Conductor"} ·{" "}
                {showPendingOnly
                  ? `${pendingCount} por revisar`
                  : `últimos ${items.length} pagos${pendingCount > 0 ? ` · ${pendingCount} pendiente${pendingCount > 1 ? "s" : ""}` : ""}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(showPendingOnly || pendingCount > 0) && (
              <button
                type="button"
                onClick={() => setShowPendingOnly(!showPendingOnly)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer whitespace-nowrap"
              >
                {showPendingOnly ? "Ver historial completo" : "Ver solo pendientes"}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          {loading ? (
            <div className="py-14 flex items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando historial...
            </div>
          ) : error ? (
            <div className="m-5 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          ) : rows.length === 0 ? (
            <div className="py-14 text-center text-sm text-gray-500">
              {showPendingOnly ? "No quedan pagos pendientes en esta placa. 🎉" : "Sin pagos registrados."}
            </div>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold text-right">Monto</th>
                  <th className="px-3 py-2 font-semibold">Comprobante</th>
                  <th className="px-3 py-2 font-semibold">Anticipo</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="hidden md:table-cell px-3 py-2 font-semibold">Nota</th>
                  <th className="px-3 py-2 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const mismatch = p.amount_mismatch;
                  const suspicious = (p.inconsistency_reasons?.length ?? 0) > 0;
                  const credit = Number(p.credit_installment_amount || 0);
                  return (
                    <tr key={p.id} className={`border-t align-top ${p.status === "pending" ? "bg-amber-50/40" : ""}`}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-medium">{p.payment_date}</div>
                        <div className="text-[11px] text-gray-400">#{p.id}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">${fmtCOP.format(Number(p.amount || 0))}</td>
                      <td className="px-3 py-2 text-xs">
                        {/* Solo avisa si el comprobante no coincide con el monto ACTUAL del pago */}
                        {mismatch && Number(mismatch.ocr_amount) !== Number(p.amount) ? (
                          <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" /> Dice ${fmtCOP.format(mismatch.ocr_amount)}
                          </span>
                        ) : suspicious ? (
                          <span className="text-amber-700" title={p.inconsistency_reasons?.join(" · ")}>
                            ⚠️ {p.inconsistency_reasons?.[0]}
                          </span>
                        ) : p.receipt_status === "maintenance_day" ? (
                          <span className="text-amber-700">🔧 Mantenimiento</span>
                        ) : (
                          <span className="text-gray-400">OK</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {p.installment_number != null ? (
                          <>
                            Cuota {p.installment_number}
                            <span className={credit > 0 ? "text-emerald-700" : "text-red-600"}> · ${fmtCOP.format(credit)}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-3 py-2 text-xs text-gray-600 max-w-[220px]">
                        {p.notes ? <span className="line-clamp-2" title={p.notes}>{p.notes}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.proof_url && (
                            <a
                              href={p.proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                              title="Ver comprobante"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          {p.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => onApprove(p.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Revisar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
