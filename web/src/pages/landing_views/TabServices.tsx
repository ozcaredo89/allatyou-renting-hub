import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, Bell } from "lucide-react";
import { AssistanceBanner } from "../../components/AssistanceBanner";
import AssistanceQuiz from "../../components/AssistanceQuiz";
import { PicoPlacaModal, ReminderModal } from "../../components/UtilitiesModals";
import { TripBookingForm } from "../../components/TripBookingForm";

export function TabServices() {
  const [searchParams] = useSearchParams();
  const [showPicoPlaca, setShowPicoPlaca] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [reminderPlate, setReminderPlate] = useState<string | undefined>(undefined);

  useEffect(() => {
    const tool = searchParams.get("tool");
    if (tool === "pico-placa") setShowPicoPlaca(true);
    if (tool === "recordatorios") setShowReminders(true);

    const rawPlate = searchParams.get("plate");
    if (rawPlate) {
      const norm = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (norm) {
        setReminderPlate(norm);
        setShowReminders(true);
      }
    }
  }, [searchParams]);

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mx-auto max-w-6xl px-4 mt-12 mb-20">
        
        {/* Temporary Hero for Services */}
        <section className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400 mb-4 uppercase tracking-wider">
            Servicios para tu Vehículo
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Todo lo que tu carro <span className="text-blue-400">necesita</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
            Desde alertas de vencimiento hasta asistencias en ruta. Mantén tu vehículo al día y protegido sin complicaciones.
          </p>

          {/* Utilidades / Tools */}
          <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
             <button 
                onClick={() => setShowPicoPlaca(true)}
                className="group flex flex-1 min-w-[250px] items-center gap-4 rounded-2xl border border-slate-700 bg-[#0f172a] px-6 py-5 text-left hover:border-blue-500/50 hover:bg-[#1e293b] transition-all shadow-lg"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-white group-hover:text-blue-300">Pico y Placa Hoy</span>
                  <span className="block text-xs text-slate-400 mt-1">Consultar restricción en tu ciudad</span>
                </div>
              </button>

              <button 
                onClick={() => setShowReminders(true)}
                className="group flex flex-1 min-w-[250px] items-center gap-4 rounded-2xl border border-slate-700 bg-[#0f172a] px-6 py-5 text-left hover:border-blue-500/50 hover:bg-[#1e293b] transition-all shadow-lg"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-white group-hover:text-blue-300">Recordatorios</span>
                  <span className="block text-xs text-slate-400 mt-1">Vencimiento SOAT y tecno</span>
                </div>
              </button>
          </div>
        </section>

        <AssistanceBanner />
        
        {/* === NUEVO: Formulario de Viajes Bajo Demanda === */}
        <section className="mb-20 mt-10">
          <TripBookingForm />
        </section>

        {/* Quiz flotante / In-page */}
        <AssistanceQuiz />

      </div>

      <PicoPlacaModal isOpen={showPicoPlaca} onClose={() => setShowPicoPlaca(false)} />
      <ReminderModal isOpen={showReminders} onClose={() => setShowReminders(false)} initialPlate={reminderPlate} />
    </div>
  );
}
