import { useState, type FormEvent } from "react";
import { X, Bell, Calendar, Search } from "lucide-react";
import picoPlacaImg from "../assets/pico-placa.png"; // Asegúrate de que la ruta sea correcta o ajustala
import { ReminderSubscriptionCard } from "./ReminderSubscriptionCard"; // Reutilizamos tu componente existente

// --- MODAL WRAPPER ---
function Modal({ title, isOpen, onClose, children }: { title: string, isOpen: boolean, onClose: () => void, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
          <h3 className="font-bold text-white flex items-center gap-2">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-0 max-h-[80vh] overflow-y-auto">
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
      <div className="p-6">
        <p className="text-slate-400 text-sm mb-4">
          Consulta la restricción vigente para vehículos particulares en Cali 2026. Evita multas planificando tu viaje.
        </p>
        <form onSubmit={handleCheck} className="flex gap-2 mb-6">
          <input 
            value={plateQuery}
            onChange={(e) => setPlateQuery(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="Ej: ABC123" 
            maxLength={6}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
          />
          <button type="submit" className="rounded-xl bg-emerald-600 px-4 font-bold text-white hover:bg-emerald-500">
            <Search className="w-5 h-5" />
          </button>
        </form>

        {result && (
          <div className="mb-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
            <p className="text-emerald-300 font-medium">{result}</p>
          </div>
        )}

        <div className="rounded-xl overflow-hidden border border-slate-700">
          {/* Asegúrate de que esta imagen exista o usa un placeholder */}
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
    <Modal title="Alertas de Vencimiento" isOpen={isOpen} onClose={onClose}>
      <div className="bg-[#0b1220]">
        <ReminderSubscriptionCard initialPlate={initialPlate} autoLoadOnMount={!!initialPlate} />
        <div className="px-6 pb-6 text-[10px] text-slate-500">
          Nunca olvides renovar tu SOAT o Técnico Mecánica. Nuestro sistema gratuito te notifica por Email y WhatsApp antes de la fecha de vencimiento para evitar fotomultas.
        </div>
      </div>
    </Modal>
  );
}

// ==========================================
// BARRA DE UTILIDADES (ACTUALIZADA: BOTONES)
// ==========================================
export function UtilitiesBar({ onOpenPicoPlaca, onOpenReminders }: { onOpenPicoPlaca: () => void, onOpenReminders: () => void }) {
  return (
    <div className="w-full border-y border-white/5 bg-[#0b1220]/80 backdrop-blur-md py-4">
      <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-4">
        
        {/* Título pequeño para contexto */}
        <span className="text-slate-500 text-xs font-bold uppercase tracking-wider hidden lg:block mr-2">
          Utilidades Gratuitas:
        </span>
        
        {/* Botón Pico y Placa */}
        <button 
          onClick={onOpenPicoPlaca} 
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/10 hover:border-emerald-500/30 hover:text-white transition-all group w-full sm:w-auto justify-center"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
            <Calendar className="w-4 h-4" />
          </div>
          <span>Consultar Pico y Placa</span>
        </button>
        
        {/* Botón Recordatorios */}
        <button 
          onClick={onOpenReminders} 
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/10 hover:border-emerald-500/30 hover:text-white transition-all group w-full sm:w-auto justify-center"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
            <Bell className="w-4 h-4" />
          </div>
          <span>Recordatorio Vencimientos</span>
        </button>

      </div>
    </div>
  );
}