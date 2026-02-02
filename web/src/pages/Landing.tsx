import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, Bell, Calculator, Info } from "lucide-react"; // Agregué iconos extra para uniformidad
import { DriverApplicationForm } from "../components/DriverApplicationForm";
import { VehicleApplicationForm } from "../components/VehicleApplicationForm";
import { ShareButton } from "../components/ShareButton";
import { IncomeSimulator } from "../components/IncomeSimulator";
import { ProcessSteps, MoneyFlow, FaqSection } from "../components/MarketingSections";
import { ModelOverview } from "../components/ModelOverview"; 
import { AssistanceBanner } from "../components/AssistanceBanner";
import { PicoPlacaModal, ReminderModal } from "../components/UtilitiesModals";
import { TrustSection } from "../components/TrustSection"; // <--- IMPORTAR
import AssistanceQuiz from "../components/AssistanceQuiz";

const WHATSAPP_URL = "https://wa.me/573113738912?text=Hola%20AllAtYou%2C%20vengo%20de%20la%20web%20y%20quiero%20m%C3%A1s%20info.";

export default function Landing() {
  const [searchParams] = useSearchParams();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  
  // Estados para Modals
  const [showPicoPlaca, setShowPicoPlaca] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [reminderPlate, setReminderPlate] = useState<string | undefined>(undefined);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        const element = document.getElementById(hash.replace("#", ""));
        if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 600);
    }
    const ref = searchParams.get("ref");
    if (ref) setReferralCode(ref);

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
    <div className="min-h-screen font-sans text-[#eaf0ff] selection:bg-emerald-500/30 selection:text-emerald-200"
         style={{
           backgroundColor: "#0b1220",
           backgroundImage: `
             radial-gradient(900px 500px at 20% 10%, rgba(16, 185, 129, 0.15), transparent 65%),
             radial-gradient(700px 450px at 85% 35%, rgba(124, 92, 255, 0.10), transparent 60%),
             radial-gradient(900px 600px at 50% 120%, rgba(251, 191, 36, 0.05), transparent 60%)
           `
         }}>

      {/* 1. NAVBAR (LIMPIO DE NUEVO) */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b1220]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-500/20 text-sm font-bold text-white">AY</div>
            <div className="leading-tight">
              <div className="font-bold text-white tracking-wide">AllAtYou</div>
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Renting Hub</div>
            </div>
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-400">
            <a href="#como" className="hover:text-white transition-colors">Cómo funciona</a>
            <a href="#flujo" className="hover:text-white transition-colors">Dinero</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>
          <div className="flex gap-3">
             <a href={WHATSAPP_URL} target="_blank" className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 transition-all">
               WhatsApp
             </a>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <main className="pb-20 pt-10">
        
        <div className="mx-auto max-w-6xl px-4">
          <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center mb-12">
            {/* Left: Copy de Venta */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 shadow-2xl backdrop-blur-sm">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-400 mb-6">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"/>
                Marketplace: Propietarios ↔ Conductores
              </div>
              
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-6 leading-[1.1]">
                Pon tu carro a producir <span className="text-emerald-400">sin manejarlo.</span>
              </h1>
              
              <p className="text-lg text-slate-400 mb-8 leading-relaxed max-w-xl">
                Asignamos un <strong className="text-slate-200">conductor verificado</strong>, administramos la operación y te liquidamos con números claros.
              </p>

              {/* === ZONA DE ACCIÓN (AQUÍ ESTÁ EL CAMBIO) === */}
              <div className="flex flex-col gap-6 mb-8">
                
                {/* 1. Botones Principales (Negocio) */}
                <div className="flex flex-wrap gap-4">
                  <a href="#simulador" className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-bold text-white shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 transition-all">
                    <Calculator className="w-4 h-4" />
                    Simular Ganancias
                  </a>
                  <a href="#como" className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-bold text-slate-200 hover:bg-white/10 transition-all">
                    <Info className="w-4 h-4" />
                    Cómo funciona
                  </a>
                </div>

                {/* 2. Botones de Utilidad (Ganchos SEO) */}
                <div>
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 pl-1">Herramientas Gratuitas</p>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button 
                        onClick={() => setShowPicoPlaca(true)}
                        className="group flex items-center gap-3 rounded-xl border border-slate-700 bg-[#0f172a] px-4 py-3 text-left hover:border-emerald-500/50 hover:bg-[#1e293b] transition-all"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-white group-hover:text-emerald-300">Pico y Placa Hoy</span>
                          <span className="block text-[10px] text-slate-500">Consultar restricción</span>
                        </div>
                      </button>

                      <button 
                        onClick={() => setShowReminders(true)}
                        className="group flex items-center gap-3 rounded-xl border border-slate-700 bg-[#0f172a] px-4 py-3 text-left hover:border-emerald-500/50 hover:bg-[#1e293b] transition-all"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          <Bell className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-white group-hover:text-emerald-300">Recordatorios</span>
                          <span className="block text-[10px] text-slate-500">Vencimiento SOAT</span>
                        </div>
                      </button>
                   </div>
                </div>

              </div>
              {/* === FIN ZONA DE ACCIÓN === */}

              {/* CHECKS DE CONFIANZA */}
              <div className="flex flex-wrap gap-3 mb-8">
                {["Conductores verificados", "Reportes + liquidación", "Soporte ante novedades"].map((text, i) => (
                  <div key={i} className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-slate-300">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-slate-950 font-bold">✓</div>
                    {text}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8 border-t border-white/5">
                <a href="#propietarios" className="group block rounded-2xl border border-white/5 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all">
                  <h3 className="font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">Soy Propietario →</h3>
                  <p className="text-xs text-slate-400">Quiero rentabilizar mi activo con control.</p>
                </a>
                <a href="#conductores" className="group block rounded-2xl border border-white/5 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all">
                  <h3 className="font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">Soy Conductor →</h3>
                  <p className="text-xs text-slate-400">Busco vehículo para trabajar ya.</p>
                </a>
              </div>
            </div>

            {/* Right: Simulador */}
            <div id="simulador" className="relative z-10">
              <ModelOverview /> 
              <IncomeSimulator />
            </div>
          </section>
        </div>

        {/* RESTO DE SECCIONES IGUALES */}
        <div className="mx-auto max-w-6xl px-4 mt-12">
          
          <section id="como" className="rounded-3xl border border-white/10 bg-[#101a33]/50 p-8 backdrop-blur-sm mb-16">
            <h2 className="text-2xl font-bold text-white mb-2">Cómo funciona (Propietarios)</h2>
            <p className="text-slate-400 mb-8 max-w-2xl">Tu carro entra a una operación administrada profesionalmente. Nosotros nos encargamos del "trabajo sucio".</p>
            <ProcessSteps />
          </section>

          <AssistanceBanner />

          <section id="flujo" className="rounded-3xl border border-white/10 bg-[#101a33]/50 p-8 backdrop-blur-sm mb-20 mt-10">
            <h2 className="text-2xl font-bold text-white mb-2">Flujo del dinero</h2>
            <p className="text-slate-400 mb-8">La confianza se construye con cuentas claras. Así se distribuye el ingreso.</p>
            <MoneyFlow />
          </section>

          {/* ... Formularios y Footer se mantienen igual ... */}
          <section id="conductores" className="mb-20 grid lg:grid-cols-[1fr_1.5fr] gap-12 items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400 mb-4">CONVOCATORIA ABIERTA</div>
              <h2 className="text-3xl font-bold text-white mb-4">Únete como Conductor</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">Accede a un vehículo en condiciones óptimas. Sin jefes, pero con el respaldo de un equipo que quiere verte crecer.</p>
              <ShareButton title="Conduce con AllAtYou" text="Oportunidad para conductores." hash="#conductores" colorClass="text-emerald-400" />
            </div>
            <div className="rounded-3xl border border-white/10 bg-[#101a33]/80 p-1"><DriverApplicationForm referralCode={referralCode || undefined} /></div>
          </section>

          <section id="propietarios" className="mb-20 grid lg:grid-cols-[1fr_1.5fr] gap-12 items-start lg:grid-flow-col-dense">
            <div className="lg:col-start-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400 mb-4">RENTABILIDAD SEGURA</div>
              <h2 className="text-3xl font-bold text-white mb-4">Registra tu Vehículo</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">Convierte tu carro en un activo real. Nosotros gestionamos todo por ti.</p>
              <ShareButton title="Administración AllAtYou" text="Rentabiliza tu vehículo." hash="#propietarios" colorClass="text-blue-400" />
            </div>
            <div className="lg:col-start-1 rounded-3xl border border-white/10 bg-[#101a33]/80 p-1"><VehicleApplicationForm /></div>
          </section>

          {/* === SECCIÓN DE CONFIANZA === */}
          <TrustSection />

          <section id="faq" className="mb-20 rounded-3xl border border-white/10 bg-[#101a33]/50 p-8">
             <h2 className="text-2xl font-bold text-white mb-6">Preguntas frecuentes</h2>
             <FaqSection />
          </section>

          <footer className="border-t border-white/10 pt-12 pb-8 text-center text-xs text-slate-500">
            <div className="flex justify-center gap-6 mb-8">
              <a href={WHATSAPP_URL} className="hover:text-emerald-400 transition-colors">WhatsApp Soporte</a>
              <a href="mailto:contacto@allatyou.com" className="hover:text-emerald-400 transition-colors">Email</a>
            </div>
            <p className="mb-2">© {new Date().getFullYear()} AllAtYou Renting S.A.S — NIT 901.995.593 — Cali, Colombia.</p>
          </footer>
          {/* === SECCIÓN DE PREGUNTAS === */}
          <AssistanceQuiz />
      
        </div>
      </main>

      <PicoPlacaModal isOpen={showPicoPlaca} onClose={() => setShowPicoPlaca(false)} />
      <ReminderModal isOpen={showReminders} onClose={() => setShowReminders(false)} initialPlate={reminderPlate} />
    </div>
  );
}