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
  Pencil,
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

type AdjustInfo = {
  payment_id: number;
  amount: number;
  installment_number: number | null;
  ocr_amount: number | null;
  canon: number;
  advance: {
    id: number;
    daily_installment: number;
    installments: number;
    paid_count: number;
    next_pending: number | null;
  } | null;
};

type TallerStay = {
  id: string;
  estado: string;
  motivo_visita: string | null;
  entrada: string;
  salida: string | null;
  salida_fuente: "bitacora" | "estimada" | null;
};
type TallerCheck = {
  taller: { available: boolean; in_shop: boolean; stays: TallerStay[] };
  // null cuando TallerPro no respondió: no se muestra nada ni se bloquea
  validation: {
    covering_stay: TallerStay | null;
    warnings: { code: string; message: string }[];
  } | null;
};
const TALLER_UNAVAILABLE: TallerCheck = { taller: { available: false, in_shop: false, stays: [] }, validation: null };

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

  // Flujo "día en mantenimiento"
  const [mttoOpen, setMttoOpen] = useState(false);
  const [mttoChecking, setMttoChecking] = useState(false);
  const [mttoCheck, setMttoCheck] = useState<TallerCheck | null>(null);
  const [mttoNote, setMttoNote] = useState("");

  // Ajuste del pago (monto / cuota de anticipo) antes de aprobar
  const [reloadKey, setReloadKey] = useState(0);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjInfo, setAdjInfo] = useState<AdjustInfo | null>(null);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjInst, setAdjInst] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjMsg, setAdjMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !paymentId) {
      setData(null);
      setErrorMsg(null);
      setSuccessMsg(null);
      setApproving(false);
      setMttoOpen(false);
      setMttoCheck(null);
      setMttoNote("");
      setAdjOpen(false);
      setAdjInfo(null);
      setAdjMsg(null);
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
  }, [isOpen, paymentId, reloadKey]);

  async function openAdjust() {
    if (!paymentId) return;
    setAdjOpen(true);
    setAdjMsg(null);
    try {
      const res = await fetch(`${API}/reports/payments/${paymentId}/adjust-info`, {
        headers: { Authorization: ensureBasicAuth() },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error cargando datos del pago");
      setAdjInfo(json);
      setAdjAmount(String(json.amount ?? ""));
      setAdjInst(json.installment_number != null ? String(json.installment_number) : "");
      setAdjNote("");
    } catch (err) {
      setAdjMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function saveAdjust() {
    if (!paymentId) return;
    setAdjSaving(true);
    setAdjMsg(null);
    try {
      const res = await fetch(`${API}/reports/payments/${paymentId}/adjust`, {
        method: "POST",
        headers: { Authorization: ensureBasicAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(adjAmount.replace(/[^\d]/g, "")),
          installment_number: adjInst.trim() ? Number(adjInst) : null,
          notes: adjNote.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.suggested_installment != null) setAdjInst(String(json.suggested_installment));
        throw new Error(json.error || "Error ajustando el pago");
      }
      setAdjMsg({ ok: true, text: json.message || "Pago ajustado." });
      setAdjOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setAdjMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setAdjSaving(false);
    }
  }

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

  async function openMaintenance() {
    if (!paymentId) return;
    setMttoOpen(true);
    setMttoChecking(true);
    setMttoCheck(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API}/reports/payments/${paymentId}/maintenance-check`, {
        headers: { Authorization: ensureBasicAuth() },
      });
      const json = await res.json().catch(() => ({}));
      setMttoCheck(res.ok && json.taller ? { taller: json.taller, validation: json.validation ?? null } : TALLER_UNAVAILABLE);
    } catch {
      setMttoCheck(TALLER_UNAVAILABLE);
    } finally {
      setMttoChecking(false);
    }
  }

  async function handleMarkMaintenance() {
    if (!paymentId) return;
    setApproving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API}/reports/payments/${paymentId}/mark-maintenance`, {
        method: "POST",
        headers: { Authorization: ensureBasicAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ notes: mttoNote.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.taller) setMttoCheck({ taller: json.taller, validation: json.validation ?? null });
        throw new Error(json.error || "Error marcando mantenimiento");
      }
      setSuccessMsg(json.message || "Pago marcado como día en mantenimiento");
      setTimeout(() => onSuccess(), 1200);
    } catch (err) {
      setErrorMsg((err instanceof Error && err.message) || "Error marcando mantenimiento");
      setApproving(false);
    }
  }

  if (!isOpen) return null;

  // Si el taller no respondió no se muestra nada y la nota es opcional (validación best-effort)
  const needsMttoNote = !!mttoCheck?.validation?.warnings.length;
  const mttoNoteOk = !needsMttoNote || mttoNote.trim().length >= 10;

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

              {/* Ajustar monto / cuota de anticipo */}
              {adjMsg && (
                <div className={`p-3 rounded-xl text-xs border ${adjMsg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"}`}>
                  {adjMsg.text}
                </div>
              )}
              {data.status === "pending" && !mttoOpen && !successMsg && (
                adjOpen ? (
                  <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                      <Pencil className="w-4 h-4" /> Ajustar el pago antes de aprobar
                    </h3>
                    {!adjInfo ? (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="text-[11px] font-semibold text-gray-700 block mb-1">Monto</label>
                          <input
                            value={adjAmount}
                            onChange={(e) => setAdjAmount(e.target.value)}
                            inputMode="numeric"
                            className="w-full text-sm rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                          {adjInfo.ocr_amount != null && adjInfo.ocr_amount !== Number(adjAmount.replace(/[^\d]/g, "")) && (
                            <button
                              type="button"
                              onClick={() => setAdjAmount(String(adjInfo.ocr_amount))}
                              className="mt-1 text-[11px] font-semibold text-blue-700 underline cursor-pointer"
                            >
                              El comprobante dice ${fmtCOP.format(adjInfo.ocr_amount)} · usar ese monto
                            </button>
                          )}
                          <p className="mt-1 text-[11px] text-gray-500">Canon del día: ${fmtCOP.format(adjInfo.canon)}</p>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-gray-700 block mb-1">Cuota del anticipo</label>
                          {adjInfo.advance ? (
                            <>
                              <input
                                value={adjInst}
                                onChange={(e) => setAdjInst(e.target.value.replace(/[^\d]/g, ""))}
                                inputMode="numeric"
                                placeholder="Sin cuota"
                                className="w-full text-sm rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                              />
                              <p className="mt-1 text-[11px] text-gray-500">
                                Anticipo #{adjInfo.advance.id}: ${fmtCOP.format(adjInfo.advance.daily_installment)} diarios · {adjInfo.advance.paid_count} de{" "}
                                {adjInfo.advance.installments} pagadas
                                {adjInfo.advance.next_pending != null && (
                                  <>
                                    {" "}·{" "}
                                    <button
                                      type="button"
                                      onClick={() => setAdjInst(String(adjInfo.advance!.next_pending))}
                                      className="font-semibold text-blue-700 underline cursor-pointer"
                                    >
                                      usar la siguiente: {adjInfo.advance.next_pending}
                                    </button>
                                  </>
                                )}
                              </p>
                              {adjInst && (
                                <p className="mt-1 text-[11px] text-gray-600">
                                  Para abonar la cuota, el monto debe cubrir canon + cuota: $
                                  {fmtCOP.format(adjInfo.canon + adjInfo.advance.daily_installment)}.
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] text-gray-500">
                              Esta placa no tiene un anticipo activo. Si se le entregó uno, primero hay que crearlo.
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-gray-700 block mb-1">
                            Nota {Number(adjAmount.replace(/[^\d]/g, "")) < adjInfo.canon ? "(obligatoria: el monto es menor que el canon)" : "(opcional)"}
                          </label>
                          <textarea
                            value={adjNote}
                            onChange={(e) => setAdjNote(e.target.value)}
                            rows={2}
                            placeholder="Ej: el comprobante es de $70.000; el conductor no pagó la cuota este día"
                            className="w-full text-xs rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setAdjOpen(false)}
                            className="px-3 py-2 rounded-lg text-xs text-gray-600 hover:bg-gray-100 cursor-pointer"
                          >
                            Cancelar ajuste
                          </button>
                          <button
                            type="button"
                            onClick={saveAdjust}
                            disabled={adjSaving}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                          >
                            {adjSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                            Guardar ajuste
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openAdjust}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-semibold cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" /> Ajustar monto o cuota del anticipo
                  </button>
                )
              )}

              {/* Día en mantenimiento */}
              {mttoOpen && (
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4" />
                    Marcar como día en mantenimiento
                  </h3>
                  <p className="text-[11px] text-amber-900">
                    El pago quedará confirmado en <strong>$0</strong> (sin reparto ni abono a anticipo) y con una nota del motivo.
                  </p>

                  {mttoChecking ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-white border border-amber-200 text-xs text-gray-700">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> Consultando en el taller...
                    </div>
                  ) : mttoCheck?.validation?.covering_stay ? (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                      <p className="font-bold">✔ El {data.payment_date} el carro estaba en el taller</p>
                      <p className="mt-0.5">
                        Entrada {mttoCheck.validation.covering_stay.entrada} · Salida{" "}
                        {mttoCheck.validation.covering_stay.salida ?? "sigue en taller"}
                        {mttoCheck.validation.covering_stay.salida_fuente === "estimada" ? " (estimada)" : ""}
                        {mttoCheck.validation.covering_stay.motivo_visita ? ` · ${mttoCheck.validation.covering_stay.motivo_visita}` : ""}
                      </p>
                    </div>
                  ) : mttoCheck?.validation?.warnings.length ? (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-xs text-red-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                      <div className="space-y-1">
                        <p className="font-bold">El día no concuerda con el taller</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {mttoCheck.validation.warnings.map((w) => (
                            <li key={w.code}>{w.message}</li>
                          ))}
                        </ul>
                        {mttoCheck.taller.stays.length > 0 && (
                          <div className="pt-1">
                            <p className="font-semibold">Últimas estadías en el taller:</p>
                            <ul className="pl-1">
                              {mttoCheck.taller.stays.slice(0, 4).map((s) => (
                                <li key={s.id}>
                                  {s.entrada} → {s.salida ?? "sigue en taller"}
                                  {s.salida_fuente === "estimada" ? " (est.)" : ""}
                                  {s.motivo_visita ? ` · ${s.motivo_visita}` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="pt-1">Escribe qué tipo de mantenimiento es y por qué no se hace en el taller.</p>
                      </div>
                    </div>
                  ) : null}

                  {!mttoChecking && mttoCheck && (
                    <div>
                      <label className="text-[11px] font-semibold text-gray-700 block mb-1">
                        Nota {needsMttoNote ? "(obligatoria, mín. 10 caracteres)" : "(opcional)"}
                      </label>
                      <textarea
                        value={mttoNote}
                        onChange={(e) => setMttoNote(e.target.value)}
                        rows={2}
                        placeholder={needsMttoNote ? "Ej: cambio de llantas en montallantas externo" : "Detalle adicional"}
                        className="w-full text-xs rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                  )}
                </div>
              )}

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
          {mttoOpen ? (
            <button
              type="button"
              onClick={handleMarkMaintenance}
              disabled={mttoChecking || approving || !mttoCheck || !mttoNoteOk || !!successMsg}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              <span>{successMsg ? "¡Marcado!" : "Confirmar día en mantenimiento"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={openMaintenance}
              disabled={loading || approving || !data || !!successMsg}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Wrench className="w-4 h-4" />
              <span>En mantenimiento</span>
            </button>
          )}
          {!mttoOpen && (
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
          )}
        </div>
      </div>
    </div>
  );
}
