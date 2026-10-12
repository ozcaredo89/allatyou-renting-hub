import { useEffect, useState } from "react";
import {
  X,
  CheckCircle2,
  Loader2,
  CreditCard,
  ExternalLink,
  Car,
  Wrench,
  ShieldCheck,
  TrendingUp,
  FileText,
  AlertTriangle,
  PlusCircle,
} from "lucide-react";
import { ensureBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

export type ApprovalPreviewData = {
  payment_id: number;
  plate: string;
  payer_name: string;
  payment_date: string;
  amount: number;
  status: string;
  receipt_status: string | null;
  proof_url: string | null;
  type: "leasing" | "renting";
  can_approve?: boolean;
  warning_message?: string | null;
  installment_number?: number | null;
  base_rent_rate?: number | null;
  leasing_contract?: {
    id: number;
    installment_no: number | null;
    due_date: string;
    status: string;
  } | null;
  active_advance?: {
    id: number;
    daily_installment: number;
    installment_no?: number | null;
  } | null;
  breakdown: {
    maintenance: number;
    car_capital: number;
    interest: number;
    admin_insurance: number;
    normal_quota: number;
    advance: number;
    excess: number;
  };
  quota_expected?: {
    maintenance: number;
    admin: number;
    interest: number;
    principal: number;
    total: number;
  } | null;
};

interface PaymentApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentId: number | null;
  plate: string | null;
  ownerName?: string | null;
  onSuccess: () => void;
}

export function PaymentApprovalModal({
  isOpen,
  onClose,
  paymentId,
  plate,
  ownerName,
  onSuccess,
}: PaymentApprovalModalProps) {
  const [data, setData] = useState<ApprovalPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !paymentId) {
      setData(null);
      setErrorMsg(null);
      setSuccessMsg(null);
      setApproving(false);
      return;
    }

    let isMounted = true;
    async function fetchPreview() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const auth = ensureBasicAuth();
        const res = await fetch(`${API}/reports/payments/${paymentId}/approval-preview`, {
          headers: { Authorization: auth },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Error al obtener la vista previa del pago");
        }

        const json = await res.json();
        if (isMounted) setData(json);
      } catch (err: any) {
        if (isMounted) setErrorMsg(err.message || "Error al cargar datos del pago");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [isOpen, paymentId]);

  async function handleApprove() {
    if (!paymentId) return;
    setApproving(true);
    setErrorMsg(null);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/reports/payments/${paymentId}/approve`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Error al aprobar el pago");
      }

      const json = await res.json();
      setSuccessMsg(json.message || "Pago aprobado exitosamente");
      setTimeout(() => {
        onSuccess();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al aprobar el pago");
      setApproving(false);
    }
  }

  if (!isOpen) return null;

  const isLeasing = data?.type === "leasing";
  const b = data?.breakdown;
  const totalBreakdown = b
    ? (b.maintenance || 0) +
      (b.car_capital || 0) +
      (b.interest || 0) +
      (b.admin_insurance || 0) +
      (b.normal_quota || 0) +
      (b.advance || 0) +
      (b.excess || 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Aprobación de Pago
              </h2>
              <p className="text-xs text-gray-500">
                Revisa la distribución contable antes de confirmar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={approving}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-14 flex flex-col items-center justify-center text-gray-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm font-medium">Calculando desglose financiero...</p>
            </div>
          ) : errorMsg && !data ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              <div>
                <p className="font-semibold">Error al cargar información</p>
                <p className="text-xs mt-0.5">{errorMsg}</p>
              </div>
            </div>
          ) : data ? (
            <>
              {/* Tarjeta de Resumen del Pago */}
              <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-black text-white font-mono font-bold text-xs rounded-lg tracking-wider">
                      {data.plate || plate}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">
                      {data.payer_name || ownerName || "Conductor"}
                    </span>
                  </div>
                  {isLeasing ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                      <Car className="w-3.5 h-3.5" />
                      Leasing / Rent-to-Own #{data.leasing_contract?.id}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                      <Car className="w-3.5 h-3.5" />
                      Renting Tradicional
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between pt-2 border-t border-gray-200/80">
                  <div>
                    <span className="text-xs text-gray-500 block">Fecha del comprobante</span>
                    <span className="text-sm font-medium text-gray-800">{data.payment_date}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500 block">Monto a Aprobar</span>
                    <span className="text-xl font-extrabold text-emerald-600">
                      ${fmtCOP.format(data.amount)} <span className="text-xs font-medium text-gray-500">COP</span>
                    </span>
                  </div>
                </div>

                {data.proof_url && (
                  <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between text-xs">
                    <span className="text-gray-500">Comprobante adjunto:</span>
                    <a
                      href={data.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium underline"
                    >
                      <span>Abrir soporte de pago</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Advertencia si no se puede aprobar automáticamente o alerta de conciliación */}
              {(data.can_approve === false || Boolean(data.warning_message)) && (
                <div className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                  data.can_approve === false
                    ? "bg-red-50 border border-red-300 text-red-900"
                    : "bg-amber-50 border border-amber-300 text-amber-900"
                }`}>
                  <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
                    data.can_approve === false ? "text-red-600" : "text-amber-600"
                  }`} />
                  <div>
                    <p className="font-bold">
                      {data.can_approve === false ? "No se puede aprobar automáticamente" : "Alerta de Conciliación"}
                    </p>
                    <p className={`mt-0.5 leading-relaxed ${
                      data.can_approve === false ? "text-red-800" : "text-amber-800"
                    }`}>
                      {data.warning_message || "Existe una discrepancia con el cronograma o la cuota ya fue pagada."}
                    </p>
                  </div>
                </div>
              )}

              {/* Título de distribución */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Destino y Distribución Contable
                </h3>

                {/* Grid de Desglose */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* 1. Mantenimiento */}
                  <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-2xs hover:border-emerald-200 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-amber-500" />
                        Mantenimiento (mtto)
                      </span>
                      <span className="text-xs font-bold text-gray-900">
                        ${fmtCOP.format(b?.maintenance || 0)}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {isLeasing ? "Fondo de mantenimiento acumulable" : "Provisión de mantenimiento del vehículo"}
                    </p>
                  </div>

                  {/* 2. Abono al Carro (Capital) */}
                  <div className={`p-3 rounded-xl border shadow-2xs transition-colors ${
                    isLeasing
                      ? "bg-purple-50/50 border-purple-200"
                      : "bg-gray-50/50 border-gray-200 opacity-60"
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-purple-600" />
                        Abono al Carro (Capital)
                      </span>
                      <span className="text-xs font-bold text-gray-900">
                        {isLeasing ? `$${fmtCOP.format(b?.car_capital || 0)}` : "—"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {isLeasing ? "Amortización directa al valor del carro" : "No aplica (Renta pura)"}
                    </p>
                  </div>

                  {/* 3. Cuota Normal de Alquiler */}
                  <div className={`p-3 rounded-xl border shadow-2xs transition-colors ${
                    !isLeasing
                      ? "bg-blue-50/50 border-blue-200"
                      : "bg-gray-50/50 border-gray-200 opacity-60"
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        Cuota Normal (Canon)
                      </span>
                      <span className="text-xs font-bold text-gray-900">
                        {!isLeasing ? `$${fmtCOP.format(b?.normal_quota || 0)}` : "—"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {!isLeasing ? "Ingreso neto de renta diaria" : "Consolidado en la amortización"}
                    </p>
                  </div>

                  {/* 4. Administración / Seguro */}
                  <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-2xs hover:border-emerald-200 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Administración (Seguro + Admon)
                      </span>
                      <span className="text-xs font-bold text-gray-900">
                        ${fmtCOP.format(b?.admin_insurance || 0)}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {isLeasing ? "Gastos administrativos leasing" : "Seguro y depósito de arrendamiento"}
                    </p>
                  </div>

                  {/* 5. Intereses (en leasing) */}
                  {isLeasing && (
                    <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-2xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                          Intereses Financiación
                        </span>
                        <span className="text-xs font-bold text-gray-900">
                          ${fmtCOP.format(b?.interest || 0)}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400">
                        Interés pactado sobre saldo a capital
                      </p>
                    </div>
                  )}

                  {/* 6. Abono a Anticipo Operacional */}
                  <div className={`p-3 rounded-xl border shadow-2xs transition-colors ${
                    (b?.advance || 0) > 0
                      ? "bg-amber-50/50 border-amber-200"
                      : data.installment_number && !data.active_advance
                        ? "bg-amber-50/70 border-amber-300"
                        : "bg-white border-gray-200"
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                        Abono al Anticipo
                      </span>
                      <span className="text-xs font-bold text-gray-900">
                        ${fmtCOP.format(b?.advance || 0)}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {data.active_advance
                        ? (b?.advance || 0) > 0
                          ? `Cuota #${data.active_advance.installment_no ?? "—"} descontada de préstamo`
                          : "Tiene anticipo activo (sin cuota en este pago)"
                        : data.installment_number
                          ? `⚠️ Pago indica Cuota #${data.installment_number} pero no hay anticipo activo`
                          : "Sin anticipo activo"}
                    </p>
                  </div>

                  {/* 7. Excedente (si hay) */}
                  {(b?.excess || 0) > 0 && (
                    <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-2xs sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                          <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                          Excedente / Saldo a Favor
                        </span>
                        <span className="text-xs font-bold text-emerald-800">
                          +${fmtCOP.format(b?.excess || 0)}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-600">
                        El monto pagado supera el valor de la cuota y quedará acreditado a favor
                      </p>
                    </div>
                  )}
                </div>

                {/* Comprobación de suma exacta */}
                <div className="mt-3 p-2.5 rounded-lg bg-gray-100 flex items-center justify-between text-xs font-medium text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Total Distribuido:
                  </span>
                  <span className="font-bold text-gray-900">
                    ${fmtCOP.format(totalBreakdown)} COP
                  </span>
                </div>
              </div>

              {/* Mensajes de éxito o error */}
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="font-medium">{successMsg}</span>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={approving}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={loading || approving || !data || data.can_approve === false || !!successMsg}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all disabled:opacity-50 cursor-pointer"
          >
            {approving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Aprobando pago...</span>
              </>
            ) : successMsg ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>¡Pago Aprobado!</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar y Aprobar Pago</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
