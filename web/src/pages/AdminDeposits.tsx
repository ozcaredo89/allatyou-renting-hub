import { useEffect, useState } from "react";
import { ensureBasicAuth } from "../lib/auth";
import { 
  Search, 
  Eye, 
  Wallet, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Plus, 
  X,
  FileText,
  AlertCircle
} from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// --- TIPOS ---
type DepositSummary = {
  id: number;
  full_name: string;
  vehicle_plate: string;
  is_active: boolean; // Viene del backend, pero la UI tiene la última palabra según la placa
  total_balance: number;
};

type HistoryItem = {
  id: string;
  date: string;
  type: string;
  concept: string;
  amount: number;
  notes: string;
  is_manual: boolean;
};

export default function AdminDeposits() {
  const [summaries, setSummaries] = useState<DepositSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDriver, setSelectedDriver] = useState<DepositSummary | null>(null);

  useEffect(() => {
    loadSummaries();
  }, []);

  async function loadSummaries() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/deposits`, { headers: { Authorization: auth } });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setSummaries(json);
    } catch (e) {
      console.error(e);
      alert("Error cargando depósitos");
    } finally {
      setLoading(false);
    }
  }

  // Filtrado de búsqueda
  const filtered = summaries.filter(s => 
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.vehicle_plate.toLowerCase().includes(search.toLowerCase())
  );

  // LÓGICA DE NEGOCIO: 
  // Solo sumamos al "Fondo Total" a los conductores que tienen carro asignado (Activos).
  // Los "Sin Asignar" se excluyen de la suma global.
  const totalGlobal = filtered.reduce((acc, curr) => {
    const isRealActive = curr.vehicle_plate !== "Sin Asignar";
    return isRealActive ? acc + curr.total_balance : acc;
  }, 0);

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-6xl">
        
        {/* HEADER */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Depósitos y Ahorros</h1>
            <p className="text-sm text-slate-500 mt-1">Gestión del fondo de garantía de conductores.</p>
          </div>
          
          {/* CARD DE TOTAL GLOBAL (SOLO ACTIVOS) */}
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-emerald-900/20 flex items-center gap-4 border border-emerald-500">
            <div className="bg-white/20 p-2 rounded-full">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-100 uppercase tracking-wider">Fondo Operativo (Activos)</p>
              <p className="text-2xl font-bold font-mono">
                $ {totalGlobal.toLocaleString("es-CO")}
              </p>
            </div>
          </div>
        </div>

        {/* BARRA DE BÚSQUEDA */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400" />
          <input 
            placeholder="Buscar por conductor o placa..." 
            className="flex-1 outline-none text-sm font-medium text-slate-700 placeholder:text-slate-400"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* TABLA PRINCIPAL */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-left">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Conductor</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Vehículo Actual</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Estado</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Saldo Acumulado</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Cargando billeteras...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No se encontraron conductores.</td></tr>
              ) : (
                filtered.map((item) => {
                  // REGLA VISUAL: Si no tiene placa, es Inactivo (rojo)
                  const isRealActive = item.vehicle_plate !== "Sin Asignar";
                  
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 font-medium text-slate-900">{item.full_name}</td>
                      <td className="px-6 py-4">
                        <span className={`font-mono px-2 py-1 rounded text-xs border ${
                          isRealActive 
                            ? "bg-slate-100 text-slate-600 border-slate-200"
                            : "bg-red-50 text-red-400 border-red-100 italic"
                        }`}>
                          {item.vehicle_plate}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isRealActive ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {/* Si es Inactivo, el saldo sale en ROJO. Si es Activo, en VERDE */}
                        <span className={`font-mono font-bold text-base ${isRealActive ? 'text-emerald-600' : 'text-red-500'}`}>
                          $ {item.total_balance.toLocaleString("es-CO")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => setSelectedDriver(item)}
                          className="text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-all"
                          title="Ver detalle y ajustar saldo"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MODAL DETALLE */}
        {selectedDriver && (
          <DetailModal 
            driver={selectedDriver} 
            onClose={() => {
              setSelectedDriver(null);
              loadSummaries(); 
            }} 
          />
        )}

      </div>
    </div>
  );
}

// --- SUB-COMPONENTE: MODAL DE DETALLE ---
function DetailModal({ driver, onClose }: { driver: DepositSummary, onClose: () => void }) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Recalculamos el estado visual dentro del modal también
  const isRealActive = driver.vehicle_plate !== "Sin Asignar";

  useEffect(() => {
    loadHistory();
  }, [driver.id]);

  async function loadHistory() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/deposits/${driver.id}/details`, { headers: { Authorization: auth } });
      const json = await res.json();
      setHistory(json);
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* HEADER MODAL */}
        <div className={`p-6 flex items-start justify-between ${isRealActive ? 'bg-slate-900' : 'bg-red-900'}`}>
          <div>
            <div className="flex items-center gap-2">
               <h3 className="text-xl font-bold text-white">{driver.full_name}</h3>
               {!isRealActive && <span className="bg-red-700 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Inactivo</span>}
            </div>
            
            <p className={`${isRealActive ? 'text-emerald-400' : 'text-red-200'} text-sm font-medium mt-1`}>
              Saldo Actual: $ {driver.total_balance.toLocaleString("es-CO")}
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CUERPO CON SCROLL */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50">
          
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Historial de Movimientos</h4>
            
            {/* AQUÍ ESTÁ EL BOTÓN DE AJUSTES */}
            <button 
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Registrar Ajuste
            </button>
          </div>

          {/* FORMULARIO DE NUEVO MOVIMIENTO (Inline) */}
          {showAddForm && (
            <AddMovementForm 
              driverId={driver.id} 
              onCancel={() => setShowAddForm(false)} 
              onSuccess={() => {
                setShowAddForm(false);
                loadHistory(); 
              }} 
            />
          )}

          {/* TIMELINE DE MOVIMIENTOS */}
          <div className="space-y-3">
            {loading ? (
              <p className="text-center text-slate-400 py-8">Cargando extracto...</p>
            ) : history.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-300">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No hay movimientos registrados.</p>
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
                  <div className={`mt-1 p-2 rounded-full shrink-0 ${
                    item.amount > 0 
                      ? "bg-emerald-100 text-emerald-600" 
                      : "bg-red-100 text-red-600"
                  }`}>
                    {item.amount > 0 ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h5 className="font-bold text-slate-800 text-sm">{item.concept}</h5>
                      <span className={`font-mono font-bold text-sm ${item.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {item.amount > 0 ? "+" : ""} $ {Math.abs(item.amount).toLocaleString("es-CO")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{new Date(item.date).toLocaleDateString()} • {new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    {item.notes && (
                      <div className="mt-2 bg-slate-50 p-2 rounded-lg text-xs text-slate-600 italic border border-slate-100">
                        "{item.notes}"
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTE: FORMULARIO DE AJUSTE ---
function AddMovementForm({ driverId, onCancel, onSuccess }: { driverId: number, onCancel: () => void, onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"IN" | "OUT">("IN"); 
  const [concept, setConcept] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !concept || !notes) return alert("Todos los campos son obligatorios");

    setSaving(true);
    try {
      const auth = ensureBasicAuth();
      const finalAmount = type === "IN" ? Number(amount) : Number(amount) * -1;

      const res = await fetch(`${API}/deposits/movement`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          driver_id: driverId,
          amount: finalAmount,
          concept,
          notes,
          created_by: 1 
        })
      });

      if (!res.ok) throw new Error(await res.text());
      onSuccess();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 bg-slate-100 p-4 rounded-xl border border-slate-200 animate-in slide-in-from-top-2">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-500"/>
            <h5 className="text-xs font-bold text-slate-500 uppercase">Nuevo Ajuste Manual</h5>
        </div>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Movimiento</label>
          <div className="flex bg-white rounded-lg p-1 border border-slate-200">
            <button 
              type="button" 
              onClick={() => setType("IN")}
              className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${type === "IN" ? "bg-emerald-100 text-emerald-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              Ingreso (+)
            </button>
            <button 
              type="button" 
              onClick={() => setType("OUT")}
              className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${type === "OUT" ? "bg-red-100 text-red-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              Retiro (-)
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Monto ($)</label>
          <input 
            type="number" 
            min="1"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900"
            placeholder="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-bold text-slate-700 mb-1">Concepto</label>
        <select 
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          value={concept}
          onChange={e => setConcept(e.target.value)}
        >
          <option value="">-- Seleccionar --</option>
          <option value="Aporte Voluntario">Aporte Voluntario</option>
          <option value="Retiro Parcial">Retiro Parcial</option>
          <option value="Liquidación Final">Liquidación Final</option>
          <option value="Descuento por Daños">Descuento por Daños</option>
          <option value="Descuento por Multa">Descuento por Multa</option>
          <option value="Ajuste Contable">Ajuste Contable</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-bold text-slate-700 mb-1">Nota (Obligatoria para auditoría)</label>
        <textarea 
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 h-16 resize-none"
          placeholder="Explica el motivo del ajuste..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-lg">Cancelar</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50">
          {saving ? "Guardando..." : "Confirmar Movimiento"}
        </button>
      </div>
    </form>
  );
}