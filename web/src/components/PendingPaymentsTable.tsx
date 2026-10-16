import { useEffect, useState } from "react";
import { Loader2, ExternalLink, CheckCircle2, History, AlertTriangle } from "lucide-react";
import { ensureBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

export type PendingPayment = {
  id: number;
  plate: string;
  owner_name: string | null;
  payment_date: string;
  amount: number;
  installment_number: number | null;
  credit_installment_amount: number;
  proof_url: string | null;
  notes: string | null;
  created_at: string;
  ocr_amount: number | null;
  inconsistency_reasons: string[];
};

interface PendingPaymentsTableProps {
  /** Filtro de texto (placa o conductor) */
  query: string;
  /** Cambia cuando se aprueba/ajusta un pago, para recargar */
  refreshKey: number;
  onReview: (p: PendingPayment) => void;
  onHistory: (p: PendingPayment) => void;
}

/** Vista "Solo pendientes": una fila por cada pago pendiente (no una por placa). */
export function PendingPaymentsTable({ query, refreshKey, onReview, onHistory }: PendingPaymentsTableProps) {
  const [items, setItems] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`${API}/reports/pending-payments`, { headers: { Authorization: ensureBasicAuth() } })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Error cargando pagos pendientes");
        if (alive) setItems(Array.isArray(json.items) ? json.items : []);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const term = query.trim().toLowerCase();
  const visible = term
    ? items.filter((p) => p.plate.toLowerCase().includes(term) || (p.owner_name ?? "").toLowerCase().includes(term))
    : items;
  const plates = new Set(visible.map((p) => p.plate)).size;

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="px-4 py-3 border-b text-sm text-gray-600">
        {loading ? "Cargando..." : `${visible.length} pago${visible.length === 1 ? "" : "s"} pendiente${visible.length === 1 ? "" : "s"} en ${plates} placa${plates === 1 ? "" : "s"}`}
      </div>
      {error && <div className="m-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Placa</th>
              <th className="px-4 py-3 font-semibold">Conductor</th>
              <th className="px-4 py-3 font-semibold">Día pagado</th>
              <th className="px-4 py-3 font-semibold text-right">Monto</th>
              <th className="px-4 py-3 font-semibold">Comprobante</th>
              <th className="px-4 py-3 font-semibold">Anticipo</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  No hay pagos pendientes de aprobación.
                </td>
              </tr>
            ) : (
              visible.map((p, i) => {
                const newPlate = i === 0 || visible[i - 1]!.plate !== p.plate;
                const ocrDiffers = p.ocr_amount != null && p.ocr_amount !== p.amount;
                return (
                  <tr key={p.id} className={`border-t ${newPlate ? "border-t-gray-300" : "border-t-gray-100"}`}>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{newPlate ? p.plate : ""}</td>
                    <td className="px-4 py-2.5 text-gray-700">{newPlate ? p.owner_name ?? "—" : ""}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {p.payment_date}
                      <span className="ml-1.5 text-[11px] text-gray-400">#{p.id}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">${fmtCOP.format(p.amount)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {ocrDiffers ? (
                        <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Dice ${fmtCOP.format(p.ocr_amount!)}
                        </span>
                      ) : p.inconsistency_reasons.length > 0 ? (
                        <span className="text-amber-700" title={p.inconsistency_reasons.join(" · ")}>
                          ⚠️ {p.inconsistency_reasons[0]}
                        </span>
                      ) : (
                        <span className="text-gray-400">OK</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      {p.installment_number != null ? (
                        <>
                          Cuota {p.installment_number}
                          <span className={p.credit_installment_amount > 0 ? "text-emerald-700" : "text-red-600"}>
                            {" "}· ${fmtCOP.format(p.credit_installment_amount)}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
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
                        <button
                          type="button"
                          onClick={() => onHistory(p)}
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg cursor-pointer"
                          title={`Ver historial de pagos de ${p.plate}`}
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReview(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Revisar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
