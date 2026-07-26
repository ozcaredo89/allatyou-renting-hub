import { useState, useEffect } from "react";
import { X, Plus, Trash2, Edit3, Save, AlertTriangle } from "lucide-react";
import { ensureBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type Item = { id: string; concept: string; amount: number; isCustom?: boolean };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  driverId: number;
  onSuccess: () => void;
}

export function LiquidationModal({ isOpen, onClose, driverId, onSuccess }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<any>(null);
  
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [liquidationId, setLiquidationId] = useState<string | null>(null);

  const [incomes, setIncomes] = useState<Item[]>([]);
  const [deductions, setDeductions] = useState<Item[]>([]);

  const [markInstallmentsPaid, setMarkInstallmentsPaid] = useState(false);

  useEffect(() => {
    if (isOpen && driverId) {
      fetchData();
    }
  }, [isOpen, driverId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/liquidations/${driverId}/data`, {
        headers: { Authorization: auth }
      });
      if (!res.ok) throw new Error("Error loading data");
      
      const json = await res.json();
      setData(json);
      
      if (json.existingLiquidation) {
        setIsReadOnly(true);
        setLiquidationId(json.existingLiquidation.id);
        const details = json.existingLiquidation.items_detail;
        setIncomes(details.incomes || []);
        setDeductions(details.deductions || []);
      } else {
        setIsReadOnly(false);
        setLiquidationId(null);
        // Default Incomes
        setIncomes([
          { id: "ahorro", concept: "AHORRO", amount: json.ahorro },
          { id: "deposito", concept: "DEPOSITO", amount: json.initialDeposit }
        ]);

        // Default Deductions
        const totalRepairs = (json.repairs || []).reduce((acc: number, r: any) => acc + r.total_amount, 0);
        setDeductions([
          { id: "gasolina", concept: "GASOLINA", amount: 50000 },
          { id: "lavado", concept: "LAVADO", amount: 45000 },
          { id: "entregas", concept: `ENTREGAS PENDIENTES (${json.pendingInstallments > 0 ? "!" : ""})`, amount: json.pendingInstallments },
          { id: "prestamo", concept: "PRESTAMO", amount: 0 },
          { id: "comparendo", concept: "COMPARENDO", amount: 0 },
          { id: "reparaciones", concept: "REPARACIONES", amount: totalRepairs }
        ]);
      }
    } catch (err) {
      console.error(err);
      alert("No se pudo cargar la información para la liquidación.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = (type: "incomes" | "deductions", id: string, amount: number) => {
    if (type === "incomes") {
      setIncomes(incomes.map(i => i.id === id ? { ...i, amount } : i));
    } else {
      setDeductions(deductions.map(i => i.id === id ? { ...i, amount } : i));
    }
  };

  const handleUpdateItemConcept = (type: "incomes" | "deductions", id: string, concept: string) => {
    if (type === "incomes") {
      setIncomes(incomes.map(i => i.id === id ? { ...i, concept } : i));
    } else {
      setDeductions(deductions.map(i => i.id === id ? { ...i, concept } : i));
    }
  };

  const handleAddItem = (type: "incomes" | "deductions") => {
    const newItem = { id: Math.random().toString(36).substring(7), concept: "Nuevo Item", amount: 0, isCustom: true };
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
        total_incomes: totalIncomes,
        total_deductions: totalDeductions,
        final_balance: finalBalance,
        items_detail: { incomes, deductions },
        created_by: "Admin", // Should be actual logged in user
        edited_by: liquidationId ? "Admin" : undefined,
        mark_installments_paid: markInstallmentsPaid
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: auth
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Error al guardar");
      }

      alert("Liquidación guardada correctamente");
      onSuccess();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              Liquidación de Conductor
            </h2>
            {loading ? (
              <p className="text-sm text-slate-500">Cargando datos...</p>
            ) : (
              <p className="text-sm text-slate-500 font-medium mt-1">
                {data?.driver?.full_name} • Placa: {data?.plate || "No asignada"} • Retiro: {new Date().toLocaleDateString()}
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
             <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
          ) : (
            <div className="space-y-8">
              
              {!data?.plate && !isReadOnly && (
                <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg flex gap-3 text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <p>Este conductor no tiene un vehículo asignado actualmente. Las reparaciones u otros gastos ligados al vehículo no se cargarán automáticamente, pero puedes agregarlos manualmente si es necesario.</p>
                </div>
              )}

              {/* Toggles and ReadOnly actions */}
              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-100">
                {isReadOnly ? (
                  <div className="flex items-center gap-4 w-full">
                    <span className="text-emerald-700 font-semibold bg-emerald-100 px-3 py-1 rounded-full text-sm">Liquidación Finalizada</span>
                    <button 
                      onClick={() => setIsReadOnly(false)} 
                      className="ml-auto flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Edit3 className="w-4 h-4" /> Editar Valores
                    </button>
                  </div>
                ) : liquidationId ? (
                   <span className="text-blue-700 font-semibold text-sm bg-blue-100 px-3 py-1 rounded-full flex items-center gap-2">
                     <AlertTriangle className="w-4 h-4"/> Editando valores... (Se guardará en auditoría)
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
                          <button onClick={() => handleRemoveItem("incomes", item.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                    {!isReadOnly && (
                      <button onClick={() => handleAddItem("incomes")} className="text-emerald-600 text-sm font-medium flex items-center gap-1 mt-2 hover:text-emerald-800">
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
                          <span className="flex-1 text-sm font-medium text-slate-700" title={item.id === 'reparaciones' && data?.repairs?.length ? data.repairs.map((r:any) => `${r.date}: ${r.category}`).join("\n") : undefined}>
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
                          <button onClick={() => handleRemoveItem("deductions", item.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                    {!isReadOnly && (
                      <button onClick={() => handleAddItem("deductions")} className="text-red-600 text-sm font-medium flex items-center gap-1 mt-2 hover:text-red-800">
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
            <div className={`text-3xl font-black ${finalBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {finalBalance < 0 ? '-' : ''}${Math.abs(finalBalance).toLocaleString()}
            </div>
          </div>
          
          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={onClose}
              className="flex-1 md:flex-none px-6 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg font-medium transition-colors"
            >
              Cerrar
            </button>
            {!isReadOnly && (
              <button
                onClick={handleSave}
                disabled={submitting || loading}
                className="flex-1 md:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-sm shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Save className="w-5 h-5" />}
                {liquidationId ? "Guardar Cambios" : "Guardar Liquidación"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
