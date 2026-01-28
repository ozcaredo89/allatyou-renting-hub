import { useState, type FormEvent } from "react";
import { X, Search } from "lucide-react";
import picoPlacaImg from "../assets/pico-placa.png"; 
import { ReminderSubscriptionCard } from "./ReminderSubscriptionCard";

// --- MODAL WRAPPER (Actualizado para recibir ancho dinámico) ---
function Modal({ 
  title, 
  isOpen, 
  onClose, 
  children,
  maxWidth = "max-w-lg" // Por defecto mantiene el tamaño pequeño (ideal para Pico y Placa)
}: { 
  title: string, 
  isOpen: boolean, 
  onClose: () => void, 
  children: React.ReactNode,
  maxWidth?: string 
}) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      {/* Aquí aplicamos la clase maxWidth que recibimos */}
      <div className={`bg-[#0b1220] border border-slate-800 w-full ${maxWidth} rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]`} onClick={e => e.stopPropagation()}>
        
        {/* Header del Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0f172a]">
          <h3 className="font-bold text-white flex items-center gap-2">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-1 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido con Scroll */}
        <div className="p-0 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}

// --- PICO Y PLACA MODAL ---
export function PicoPlacaModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [plateQuery, setPlateQuery] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

  const PICO_PLACA_RULES: Record<number, string> = {
    0: "Viernes (0) - Mañana y Tarde", 1: "Lunes (1) - Mañana y Tarde", 2: "Lunes (2) - Mañana y Tarde",
    3: "Martes (3) - Mañana y Tarde", 4: "Martes (4) - Mañana y Tarde", 5: "Miércoles (5) - Mañana y Tarde",
    6: "Miércoles (6) - Mañana y Tarde", 7: "Jueves (7) - Mañana y Tarde", 8: "Jueves (8) - Mañana y Tarde",
    9: "Viernes (9) - Mañana y Tarde",
  };

  function handleCheck(e: FormEvent) {
    e.preventDefault();
    const clean = plateQuery.replace(/\s+/g, "").toUpperCase();
    if (!clean || !clean.match(/(\d)$/)) {
      setResult("Ingresa una placa válida terminada en número."); return;
    }
    const last = Number(clean.match(/(\d)$/)![1]);
    setResult(PICO_PLACA_RULES[last] || "Sin restricción o revisa calendario oficial.");
    fetch(`${API}/metrics/pico-placa-use`, { method: "POST" }).catch(() => {});
  }

  return (
    <Modal title="Consultar Pico y Placa Cali" isOpen={isOpen} onClose={onClose}>
      <div className="p-6 bg-[#0b1220]">
        <p className="text-slate-400 text-sm mb-4">
          Consulta la restricción vigente para vehículos particulares en Cali 2026. Evita multas planificando tu viaje.
        </p>
        <form onSubmit={handleCheck} className="flex gap-2 mb-6">
          <input 
            value={plateQuery}
            onChange={(e) => setPlateQuery(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="Ej: ABC123" 
            maxLength={6}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
          />
          <button type="submit" className="rounded-xl bg-emerald-600 px-4 font-bold text-white hover:bg-emerald-500 transition-colors">
            <Search className="w-5 h-5" />
          </button>
        </form>

        {result && (
          <div className="mb-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
            <p className="text-emerald-300 font-medium">{result}</p>
          </div>
        )}

        <div className="rounded-xl overflow-hidden border border-slate-700">
          <img src={picoPlacaImg} alt="Calendario Pico y Placa Cali 2026" className="w-full h-auto opacity-90" />
        </div>
        
        <div className="mt-4 text-[10px] text-slate-600 leading-tight">
          <p>Información actualizada sobre el decreto de Pico y Placa en Cali para el año 2026. Horarios, rotación semestral y excepciones para carros particulares.</p>
        </div>
      </div>
    </Modal>
  );
}

// --- REMINDER MODAL ---
export function ReminderModal({ isOpen, onClose, initialPlate }: { isOpen: boolean, onClose: () => void, initialPlate?: string }) {
  return (
    <Modal 
      title="Alertas de Vencimiento" 
      isOpen={isOpen} 
      onClose={onClose}
      maxWidth="max-w-4xl" // <--- ESTO ES LA CLAVE: Hace el modal ancho
    >
      <div className="bg-[#0b1220] p-1"> 
        <ReminderSubscriptionCard initialPlate={initialPlate} autoLoadOnMount={!!initialPlate} />
      </div>
    </Modal>
  );
}

// NOTA: Se eliminó UtilitiesBar porque ya no se usa (se movió a Landing.tsx).