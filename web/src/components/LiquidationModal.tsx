import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Edit3,
  Save,
  AlertTriangle,
  FileText,
  Calendar,
  CheckCircle2,
  Upload,
  ExternalLink,
  Download,
  Clock,
  Loader2,
} from "lucide-react";
import { ensureBasicAuth } from "../lib/auth";
import { LiquidationDocModal } from "./LiquidationDocModal";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type Item = { id: string; concept: string; amount: number; isCustom?: boolean };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  driverId: number;
  onSuccess: () => void;
}

function addDaysYmd(ymdStr: string, days: number): string {
  const base = ymdStr.slice(0, 10);
  const d = new Date(`${base}T12:00:00Z`);
  if (isNaN(d.getTime())) return base;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDaysYmd(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd.slice(0, 10)}T12:00:00Z`).getTime();
  const b = new Date(`${toYmd.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function LiquidationModal({ isOpen, onClose, driverId, onSuccess }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<any>(null);

  const [isReadOnly, setIsReadOnly] = useState(false);
  const [liquidationId, setLiquidationId] = useState<string | null>(null);
  const [showDocModal, setShowDocModal] = useState(false);

  const [incomes, setIncomes] = useState<Item[]>([]);
  const [deductions, setDeductions] = useState<Item[]>([]);
  const [markInstallmentsPaid, setMarkInstallmentsPaid] = useState(false);

  // Fecha local del navegador (Colombia); toISOString daría el día siguiente después de las 7 pm
  const todayYmd = new Date().toLocaleDateString("en-CA");
  const [retireDate, setRetireDate] = useState<string>(todayYmd);
  const [paymentDueDate, setPaymentDueDate] = useState<string>(addDaysYmd(todayYmd, 20));

  // Soportes: Paz y Salvo + Comprobante de Pago
  const [hasPazSalvo, setHasPazSalvo] = useState(false);
  const [docUrls, setDocUrls] = useState<{ pdf_url: string; docx_url: string } | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [paidAt, setPaidAt] = useState<string>(todayYmd);
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [savingProof, setSavingProof] = useState(false);

  useEffect(() => {
    if (isOpen && driverId) {
      fetchData();
    }
  }, [isOpen, driverId]);

  const fetchDocUrls = async (liqId: string) => {
    setLoadingDocs(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/liquidations/${liqId}/document-urls`, {
        headers: { Authorization: auth },
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.pdf_url) {
          setDocUrls({ pdf_url: d.pdf_url, docx_url: d.docx_url });
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/liquidations/${driverId}/data`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) throw new Error("Error loading data");

      const json = await res.json();
      setData(json);

      if (json.existingLiquidation) {
        const liq = json.existingLiquidation;
        setIsReadOnly(true);
        setLiquidationId(liq.id);
        const details = liq.items_detail || {};
        setIncomes(details.incomes || []);
        setDeductions(details.deductions || []);

        const rDate = (liq.retire_date || liq.liquidation_date || liq.created_at || todayYmd).slice(0, 10);
        const pDate = (liq.payment_due_date || addDaysYmd(rDate, 20)).slice(0, 10);
        setRetireDate(rDate);
        setPaymentDueDate(pDate);

        setHasPazSalvo(Boolean(liq.has_paz_salvo));
        setPaymentProofUrl(liq.payment_proof_url || null);
        setIsPaid(Boolean(liq.is_paid));
        setPaidAt(liq.paid_at ? new Date(liq.paid_at).toLocaleDateString("en-CA") : todayYmd);
        setPaymentNotes(liq.payment_notes || "");

        if (liq.has_paz_salvo) {
          fetchDocUrls(liq.id);
        } else {
          setDocUrls(null);
        }
      } else {
        setIsReadOnly(false);
        setLiquidationId(null);
        setHasPazSalvo(false);
        setDocUrls(null);
        setPaymentProofUrl(null);
        setIsPaid(false);
        setPaidAt(todayYmd);
        setPaymentNotes("");

        const rDate = json.driver?.terminated_at
          ? new Date(json.driver.terminated_at).toLocaleDateString("en-CA")
          : todayYmd;
        setRetireDate(rDate);
        setPaymentDueDate(addDaysYmd(rDate, 20));

        // Default Incomes
        setIncomes([
          { id: "ahorro", concept: "AHORRO", amount: json.ahorro },
          { id: "deposito", concept: "DEPOSITO", amount: json.initialDeposit },
        ]);

        // Default Deductions
        const totalRepairs = (json.repairs || []).reduce((acc: number, r: any) => acc + r.total_amount, 0);
        setDeductions([
          { id: "gasolina", concept: "GASOLINA", amount: 50000 },
          { id: "lavado", concept: "LAVADO", amount: 45000 },
          {
            id: "entregas",
            concept: `ENTREGAS PENDIENTES (${json.pendingInstallments > 0 ? "!" : ""})`,
            amount: json.pendingInstallments,
          },
          { id: "prestamo", concept: "PRESTAMO", amount: 0 },
          { id: "comparendo", concept: "COMPARENDO", amount: 0 },
          { id: "reparaciones", concept: "REPARACIONES", amount: totalRepairs },
          ...(json.pendingRentDebt > 0
            ? [
                {
                  id: "dias_mora",
                  concept: `DÍAS EN MORA (${json.pendingRentDebtDetails.length})`,
                  amount: json.pendingRentDebt,
                },
              ]
            : []),
        ]);
      }
    } catch (err) {
      console.error(err);
      alert("No se pudo cargar la información para la liquidación.");
    } finally {
      setLoading(false);
    }
  };

  const handleRetireDateChange = (newRetireYmd: string) => {
    setRetireDate(newRetireYmd);
    if (newRetireYmd) {
      setPaymentDueDate(addDaysYmd(newRetireYmd, 20));
    }
  };

  const handleUpdateItem = (type: "incomes" | "deductions", id: string, amount: number) => {
    if (type === "incomes") {
      setIncomes(incomes.map(i => (i.id === id ? { ...i, amount } : i)));
    } else {
      setDeductions(deductions.map(i => (i.id === id ? { ...i, amount } : i)));
    }
  };

  const handleUpdateItemConcept = (type: "incomes" | "deductions", id: string, concept: string) => {
    if (type === "incomes") {
      setIncomes(incomes.map(i => (i.id === id ? { ...i, concept } : i)));
    } else {
      setDeductions(deductions.map(i => (i.id === id ? { ...i, concept } : i)));
    }
  };

  const handleAddItem = (type: "incomes" | "deductions") => {
    const newItem = {
      id: Math.random().toString(36).substring(7),
      concept: "Nuevo Item",
      amount: 0,
      isCustom: true,
    };
    if (type === "incomes") setIncomes([...incomes, newItem]);
    else setDeductions([...deductions, newItem]);
  };

  const handleRemoveItem = (type: "incomes" | "deductions", id: string) => {
    if (type === "incomes") setIncomes(incomes.filter(i => i.id !== id));
    else setDeductions(deductions.filter(i => i.id !== id));
  };

  const totalIncomes = incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalDeductions = deductions.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const finalBalance = totalIncomes - totalDeductions;

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const auth = ensureBasicAuth();
      const url = liquidationId ? `${API}/liquidations/${liquidationId}` : `${API}/liquidations`;
      const method = liquidationId ? "PUT" : "POST";

      const payload = {
        driver_id: driverId,
        plate: data?.plate,
        liquidation_date: `${retireDate}T12:00:00.000Z`,
        payment_due_date: paymentDueDate,
        total_incomes: totalIncomes,
        total_deductions: totalDeductions,
        final_balance: finalBalance,
        items_detail: { incomes, deductions },
        created_by: "Admin",
        edited_by: liquidationId ? "Admin" : undefined,
        mark_installments_paid: markInstallmentsPaid,
        liquidation_debt_ids:
          !liquidationId && deductions.some(d => d.id === "dias_mora")
            ? (data?.pendingRentDebtDetails || []).map((p: any) => p.id)
            : undefined,
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Error al guardar");
      }

      const savedLiq = await res.json();
      if (savedLiq?.id) {
        setLiquidationId(savedLiq.id);
        setIsReadOnly(true);
      }

      alert("Liquidación guardada correctamente");
      onSuccess();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !liquidationId) return;

    setUploadingProof(true);
    try {
      const auth = ensureBasicAuth();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "drivers");

      const uploadRes = await fetch(`${API}/uploads`, {
        method: "POST",
        headers: { Authorization: auth },
        body: fd,
      });

      if (!uploadRes.ok) {
        throw new Error("No se pudo subir el archivo del comprobante");
      }

      const uploadData = await uploadRes.json();
      const uploadedUrl = uploadData.url;
      setPaymentProofUrl(uploadedUrl);
      setIsPaid(true);

      // Guardar inmediatamente en la liquidación
      setSavingProof(true);
      const saveRes = await fetch(`${API}/liquidations/${liquidationId}/payment-proof`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify({
          payment_proof_url: uploadedUrl,
          paid_at: paidAt,
          payment_notes: paymentNotes,
          recorded_by: "Admin",
        }),
      });

      if (!saveRes.ok) {
        const errJson = await saveRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Error registrando comprobante");
      }

      onSuccess();
    } catch (err: any) {
      alert("Error al subir comprobante: " + err.message);
    } finally {
      setUploadingProof(false);
      setSavingProof(false);
      e.target.value = "";
    }
  };

  // Con saldo ≤ 0 no hay transferencia: se marca como pagada/saldada sin comprobante y deja de alertar
  const handleMarkSettled = async () => {
    if (!liquidationId) return;
    if (!confirm("¿Marcar esta liquidación como pagada/saldada sin comprobante? Dejará de generar alertas.")) return;
    setSavingProof(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/liquidations/${liquidationId}/payment-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          paid_at: paidAt,
          payment_notes: paymentNotes || "Saldada sin devolución (saldo ≤ 0)",
          recorded_by: "Admin",
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "No se pudo marcar como saldada");
      }
      setIsPaid(true);
      onSuccess();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingProof(false);
    }
  };

  const handleSaveProofMetadata = async () => {
    if (!liquidationId || !isPaid) return;
    setSavingProof(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/liquidations/${liquidationId}/payment-proof`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify({
          payment_proof_url: paymentProofUrl,
          paid_at: paidAt,
          payment_notes: paymentNotes,
          recorded_by: "Admin",
        }),
      });
      if (!res.ok) throw new Error("No se pudo actualizar el registro de pago");
      alert("Registro de pago actualizado");
      onSuccess();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingProof(false);
    }
  };

  if (!isOpen) return null;

  const daysUntilPayment = diffDaysYmd(todayYmd, paymentDueDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              Liquidación y Retiro de Conductor
            </h2>
            {loading ? (
              <p className="text-sm text-slate-500">Cargando datos...</p>
            ) : (
              <p className="text-sm text-slate-500 font-medium mt-1">
                {data?.driver?.full_name} • Placa: {data?.plate || "No asignada"} • Retiro: {retireDate}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center p-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Cronograma Regla 20 días SIMIT y Notificación 3 días antes */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Cronograma de Retiro y Pago (Plazo 20 Días Calendario SIMIT)
                    </span>
                  </div>
                  {isPaid ? (
                    <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Liquidación Pagada
                    </span>
                  ) : daysUntilPayment <= 3 ? (
                    <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />{" "}
                      {daysUntilPayment < 0
                        ? `Pago vencido hace ${-daysUntilPayment} día(s)`
                        : daysUntilPayment === 0
                        ? "Pago vence HOY (20 días SIMIT)"
                        : `Pago vence en ${daysUntilPayment} día(s) — En ventana de alerta por correo`}
                    </span>
                  ) : (
                    <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Faltan {daysUntilPayment} día(s) para pago (aviso por correo 3 días antes)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Fecha de Retiro / Entrega Vehículo
                    </label>
                    <input
                      type="date"
                      disabled={isReadOnly}
                      value={retireDate}
                      onChange={(e) => handleRetireDateChange(e.target.value)}
                      className="w-full font-mono font-bold text-slate-800 border border-slate-200 rounded px-2 py-1 disabled:bg-slate-50"
                    />
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Fecha Límite de Pago (+20 días SIMIT)
                    </label>
                    <input
                      type="date"
                      disabled={isReadOnly}
                      value={paymentDueDate}
                      onChange={(e) => setPaymentDueDate(e.target.value)}
                      className="w-full font-mono font-bold text-emerald-700 border border-slate-200 rounded px-2 py-1 disabled:bg-slate-50"
                    />
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-center">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Notificación Automática por Correo
                    </span>
                    <span className="font-mono font-bold text-slate-700 mt-0.5">
                      Desde {addDaysYmd(paymentDueDate, -3)} (3 días antes)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Se detiene al subir el comprobante de pago
                    </span>
                  </div>
                </div>
              </div>

              {/* Panel de Soportes de Cierre: Paz y Salvo + Comprobante de Pago (visible cuando ya existe la liquidación) */}
              {liquidationId && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card 1: Documento de Paz y Salvo */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-blue-600" />
                          1. Documento de Paz y Salvo
                        </span>
                        {hasPazSalvo || docUrls ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            Generado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                            Pendiente
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Acta de entrega, liquidación y cláusula de 20 días calendario para validación SIMIT.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {loadingDocs ? (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando enlaces...
                        </span>
                      ) : docUrls ? (
                        <>
                          <a
                            href={docUrls.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Ver Paz y Salvo (PDF)
                          </a>
                          <a
                            href={docUrls.docx_url}
                            download={`Paz_y_Salvo_${(data?.driver?.full_name || "Conductor").replace(/\s+/g, "_")}.docx`}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> Word (.docx)
                          </a>
                        </>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setShowDocModal(true)}
                        disabled={!isReadOnly}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {docUrls || hasPazSalvo ? "Configurar / Regenerar" : "Generar Paz y Salvo"}
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Comprobante de Pago */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          2. Comprobante de Pago
                        </span>
                        {isPaid ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            {paymentProofUrl ? "Pagado" : "Saldada"} ({paidAt})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                            Sin comprobante
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Soporte de transferencia o recibo de pago de la devolución de garantía.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500">Fecha de Pago</label>
                          <input
                            type="date"
                            value={paidAt}
                            onChange={(e) => setPaidAt(e.target.value)}
                            className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500">Referencia / Nota</label>
                          <input
                            type="text"
                            placeholder="Ej: Nequi / Bancolombia"
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {paymentProofUrl && (
                          <a
                            href={paymentProofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Ver Comprobante de Pago
                          </a>
                        )}

                        <label className="cursor-pointer px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors">
                          {uploadingProof || savingProof ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo...
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              {paymentProofUrl ? "Cambiar Comprobante" : "Subir Comprobante de Pago"}
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={handleUploadProofFile}
                            disabled={uploadingProof || savingProof}
                            className="hidden"
                          />
                        </label>

                        {!isPaid && finalBalance <= 0 && (
                          <button
                            type="button"
                            onClick={handleMarkSettled}
                            disabled={savingProof}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como saldada
                          </button>
                        )}

                        {isPaid && (
                          <button
                            type="button"
                            onClick={handleSaveProofMetadata}
                            disabled={savingProof}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            Guardar nota/fecha
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!data?.plate && !isReadOnly && (
                <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg flex gap-3 text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <p>
                    Este conductor no tiene un vehículo asignado actualmente. Las reparaciones u otros gastos ligados al vehículo no se cargarán automáticamente, pero puedes agregarlos manualmente si es necesario.
                  </p>
                </div>
              )}

              {/* Deuda de días en mora posterior a una liquidación cerrada: queda aparte */}
              {data?.existingLiquidation && data?.pendingRentDebt > 0 && (
                <div className="bg-red-50 text-red-800 p-4 rounded-lg flex gap-3 text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <p>
                    Deuda aparte: {data.pendingRentDebtDetails.length} día(s) en mora por descontar, $
                    {Number(data.pendingRentDebt).toLocaleString("es-CO")} (
                    {data.pendingRentDebtDetails.map((p: any) => `${p.plate} ${p.payment_date}`).join(", ")}). No se suma a la liquidación ya cerrada.
                  </p>
                </div>
              )}

              {/* Toggles and ReadOnly actions */}
              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-100">
                {isReadOnly ? (
                  <div className="flex items-center gap-4 w-full">
                    <span className="text-emerald-700 font-semibold bg-emerald-100 px-3 py-1 rounded-full text-sm">
                      Liquidación Guardada
                    </span>
                    <button
                      onClick={() => setIsReadOnly(false)}
                      className="ml-auto flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Edit3 className="w-4 h-4" /> Editar Valores / Fechas
                    </button>
                  </div>
                ) : liquidationId ? (
                  <span className="text-blue-700 font-semibold text-sm bg-blue-100 px-3 py-1 rounded-full flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Editando valores... (Se guardará en auditoría)
                  </span>
                ) : (
                  <div className="flex flex-col gap-1 w-full">
                    {data?.pendingInstallments > 0 && (
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={markInstallmentsPaid}
                          onChange={(e) => setMarkInstallmentsPaid(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        Marcar las {data?.pendingDetails?.length} cuotas de préstamos pendientes como pagadas al guardar
                      </label>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Ingresos / Saldos a Favor */}
                <div>
                  <h3 className="text-lg font-bold text-emerald-700 mb-4 flex items-center gap-2 border-b pb-2">
                    Saldos a Favor
                  </h3>
                  <div className="space-y-3">
                    {incomes.map(item => (
                      <div key={item.id} className="flex items-center gap-2">
                        {item.isCustom ? (
                          <input
                            disabled={isReadOnly}
                            value={item.concept}
                            onChange={(e) => handleUpdateItemConcept("incomes", item.id, e.target.value)}
                            className="flex-1 text-sm border-slate-200 rounded-lg p-2 disabled:bg-slate-50"
                          />
                        ) : (
                          <span className="flex-1 text-sm font-medium text-slate-700">{item.concept}</span>
                        )}
                        <div className="relative w-32 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                          <input
                            type="number"
                            disabled={isReadOnly}
                            value={item.amount}
                            onChange={(e) => handleUpdateItem("incomes", item.id, Number(e.target.value))}
                            className="w-full pl-7 pr-2 py-2 text-sm border-slate-200 rounded-lg text-right font-medium disabled:bg-slate-50"
                          />
                        </div>
                        {item.isCustom && !isReadOnly && (
                          <button
                            onClick={() => handleRemoveItem("incomes", item.id)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {!isReadOnly && (
                      <button
                        onClick={() => handleAddItem("incomes")}
                        className="text-emerald-600 text-sm font-medium flex items-center gap-1 mt-2 hover:text-emerald-800"
                      >
                        <Plus className="w-4 h-4" /> Agregar Ítem
                      </button>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200 flex justify-between items-center text-slate-800">
                    <span className="font-bold">Total a favor</span>
                    <span className="font-bold text-emerald-600">${totalIncomes.toLocaleString()}</span>
                  </div>
                </div>

                {/* Descuentos */}
                <div>
                  <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2 border-b pb-2">
                    Descuentos
                  </h3>
                  <div className="space-y-3">
                    {deductions.map(item => (
                      <div key={item.id} className="flex items-center gap-2">
                        {item.isCustom ? (
                          <input
                            disabled={isReadOnly}
                            value={item.concept}
                            onChange={(e) => handleUpdateItemConcept("deductions", item.id, e.target.value)}
                            className="flex-1 text-sm border-slate-200 rounded-lg p-2 disabled:bg-slate-50"
                          />
                        ) : (
                          <span
                            className="flex-1 text-sm font-medium text-slate-700"
                            title={
                              item.id === "reparaciones" && data?.repairs?.length
                                ? data.repairs.map((r: any) => `${r.date}: ${r.category}`).join("\n")
                                : undefined
                            }
                          >
                            {item.concept}
                          </span>
                        )}
                        <div className="relative w-32 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                          <input
                            type="number"
                            disabled={isReadOnly}
                            value={item.amount}
                            onChange={(e) => handleUpdateItem("deductions", item.id, Number(e.target.value))}
                            className="w-full pl-7 pr-2 py-2 text-sm border-slate-200 rounded-lg text-right font-medium disabled:bg-slate-50 text-red-600"
                          />
                        </div>
                        {item.isCustom && !isReadOnly && (
                          <button
                            onClick={() => handleRemoveItem("deductions", item.id)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {!isReadOnly && (
                      <button
                        onClick={() => handleAddItem("deductions")}
                        className="text-red-600 text-sm font-medium flex items-center gap-1 mt-2 hover:text-red-800"
                      >
                        <Plus className="w-4 h-4" /> Agregar Ítem
                      </button>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200 flex justify-between items-center text-slate-800">
                    <span className="font-bold">Total Descuentos</span>
                    <span className="font-bold text-red-600">-${totalDeductions.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col md:flex-row items-center justify-between rounded-b-xl gap-4">
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-500 font-medium">TOTAL FINAL A PAGAR:</div>
            <div className={`text-3xl font-black ${finalBalance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {finalBalance < 0 ? "-" : ""}${Math.abs(finalBalance).toLocaleString()}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <button
              onClick={onClose}
              className="flex-1 md:flex-none px-5 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg font-medium transition-colors text-sm"
            >
              Cerrar
            </button>

            {liquidationId && isReadOnly ? (
              <button
                onClick={() => setShowDocModal(true)}
                className="flex-1 md:flex-none px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm shadow-blue-200 transition-all flex items-center justify-center gap-2 text-sm"
                title="Generar Paz y Salvo, Acta de Entrega y Devolución de Garantía"
              >
                <FileText className="w-4 h-4" />
                {hasPazSalvo || docUrls ? "Ver / Regenerar Paz y Salvo" : "Generar Paz y Salvo"}
              </button>
            ) : liquidationId && !isReadOnly ? (
              <button
                disabled={true}
                className="flex-1 md:flex-none px-4 py-2.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-lg font-medium transition-all flex items-center justify-center gap-2 cursor-not-allowed text-xs"
                title="Guarda los cambios primero para generar el documento oficial con respaldo legal"
              >
                <FileText className="w-3.5 h-3.5" />
                Guarda cambios para generar documento
              </button>
            ) : null}

            {!isReadOnly && (
              <button
                onClick={handleSave}
                disabled={submitting || loading}
                className="flex-1 md:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-sm shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 text-sm"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {liquidationId ? "Guardar Cambios" : "Guardar Liquidación"}
              </button>
            )}
          </div>
        </div>
      </div>

      {showDocModal && liquidationId && data?.driver && (
        <LiquidationDocModal
          isOpen={showDocModal}
          onClose={() => setShowDocModal(false)}
          liquidationId={liquidationId}
          driver={data.driver}
          plate={data.plate}
          vehicle={data.vehicle}
          incomes={incomes}
          deductions={deductions}
          totalIncomes={totalIncomes}
          totalDeductions={totalDeductions}
          finalBalance={finalBalance}
          savingsStartDate={data.savingsStartDate}
          savingsEndDate={data.savingsEndDate}
          retireDate={retireDate}
          paymentDueDate={paymentDueDate}
          hasExistingDoc={hasPazSalvo}
          onDocumentGenerated={() => {
            setHasPazSalvo(true);
            fetchDocUrls(liquidationId);
            onSuccess();
          }}
          repairs={data.repairs}
        />
      )}
    </div>
  );
}
