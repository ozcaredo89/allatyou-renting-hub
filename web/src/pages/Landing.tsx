import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { DriverApplicationForm } from "../components/DriverApplicationForm";
import { VehicleApplicationForm } from "../components/VehicleApplicationForm";
import { ReminderSubscriptionCard } from "../components/ReminderSubscriptionCard";
import { ShareButton } from "../components/ShareButton";
import { IncomeSimulator } from "../components/IncomeSimulator";
import { ProcessSteps, MoneyFlow, FaqSection } from "../components/MarketingSections";
import { ModelOverview } from "../components/ModelOverview"; 
import picoPlacaImg from "../assets/pico-placa.png";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const WHATSAPP_URL = "https://wa.me/573113738912?text=Hola%20AllAtYou%2C%20vengo%20de%20la%20web%20y%20quiero%20m%C3%A1s%20info.";

const PICO_PLACA_RULES: Record<number, string> = {
  0: "Viernes (0) - Mañana y Tarde", 1: "Lunes (1) - Mañana y Tarde", 2: "Lunes (2) - Mañana y Tarde",
  3: "Martes (3) - Mañana y Tarde", 4: "Martes (4) - Mañana y Tarde", 5: "Miércoles (5) - Mañana y Tarde",
  6: "Miércoles (6) - Mañana y Tarde", 7: "Jueves (7) - Mañana y Tarde", 8: "Jueves (8) - Mañana y Tarde",
  9: "Viernes (9) - Mañana y Tarde",
};

export default function Landing() {
  const [plateQuery, setPlateQuery] = useState("");
  const [picoPlacaResult, setPicoPlacaResult] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [landingViews, setLandingViews] = useState<number | null>(null);
  const [initialReminderPlate, setInitialReminderPlate] = useState<string | undefined>(undefined);
  const [autoLoadReminders, setAutoLoadReminders] = useState(false);
  const remindersRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        const element = document.getElementById(hash.replace("#", ""));
        if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 600);
    }
    
    fetch(`${API}/metrics/landing-view`, { method: "POST" }).catch(() => {});
    fetch(`${API}/metrics/summary`)
      .then(r => r.json())
      .then(d => setLandingViews(d.landing_views ?? null))
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const rawPlate = params.get("plate");
    if (params.get("ref")) setReferralCode(params.get("ref"));
    if (rawPlate) {
      const norm = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (norm) { setInitialReminderPlate(norm); setAutoLoadReminders(true); }
    }
    if (params.get("focus") === "reminders") {
      setTimeout(() => remindersRef.current?.scrollIntoView({ behavior: "smooth" }), 300);
    }
  }, []);

  function handleCheckPicoPlaca(e: FormEvent) {
    e.preventDefault();
    const clean = plateQuery.replace(/\s+/g, "").toUpperCase();
    if (!clean || !clean.match(/(\d)$/)) {
      setPicoPlacaResult("Ingresa una placa válida (Ej: ABC123)"); return;
    }
    const last = Number(clean.match(/(\d)$/)![1]);
    setPicoPlacaResult(PICO_PLACA_RULES[last] || "Revisa el calendario oficial.");
    fetch(`${API}/metrics/pico-placa-use`, { method: "POST" }).catch(() => {});
  }

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
            <a href="#pico-placa" className="hover:text-white transition-colors">Utilidades</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>
          <div className="flex gap-3">
             <a href="#simulador" className="hidden sm:inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold hover:bg-white/10 transition-all">
               Simular
             </a>
             <a href={WHATSAPP_URL} target="_blank" className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 transition-all">
               WhatsApp
             </a>
          </div>
        </div>
      </header>

      <main className="px-4 pb-20 pt-10">
        <div className="mx-auto max-w-6xl">
          
          <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center mb-20">
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

              <div className="flex flex-wrap gap-4 mb-8">
                <a href="#simulador" className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 transition-all">
                  Simular Ganancias
                </a>
                <a href="#como" className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-slate-200 hover:bg-white/10 transition-all">
                  Cómo funciona
                </a>
              </div>

              {/* CHECKS DE CONFIANZA */}
              <div className="flex flex-wrap gap-3 mb-8">
                {[
                  "Conductores verificados",
                  "Reportes + liquidación",
                  "Soporte ante novedades"
                ].map((text, i) => (
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

            {/* Right: Simulador + Modelo Visual */}
            <div id="simulador" className="relative z-10">
              {/* COMPONENTE NUEVO */}
              <ModelOverview /> 
              <IncomeSimulator />
            </div>
          </section>

          {/* SECCIONES INFORMATIVAS */}
          <div className="grid gap-6 mb-20">
            <section id="como" className="rounded-3xl border border-white/10 bg-[#101a33]/50 p-8 backdrop-blur-sm">
              <h2 className="text-2xl font-bold text-white mb-2">Cómo funciona (Propietarios)</h2>
              <p className="text-slate-400 mb-8 max-w-2xl">Tu carro entra a una operación administrada profesionalmente. Nosotros nos encargamos del "trabajo sucio".</p>
              <ProcessSteps />
            </section>

            <section id="flujo" className="rounded-3xl border border-white/10 bg-[#101a33]/50 p-8 backdrop-blur-sm">
              <h2 className="text-2xl font-bold text-white mb-2">Flujo del dinero</h2>
              <p className="text-slate-400 mb-8">La confianza se construye con cuentas claras. Así se distribuye el ingreso.</p>
              <MoneyFlow />
            </section>
          </div>

          {/* UTILIDADES */}
          <section id="pico-placa" className="grid lg:grid-cols-2 gap-8 mb-20">
            <div className="rounded-3xl border border-white/10 bg-[#0e1730] p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Pico y Placa Cali</h3>
                {landingViews && <span className="text-[10px] bg-white/5 px-2 py-1 rounded text-slate-400">👁 {landingViews} visitas hoy</span>}
              </div>
              
              <form onSubmit={handleCheckPicoPlaca} className="flex gap-2 mb-6">
                <input 
                  value={plateQuery}
                  onChange={(e) => setPlateQuery(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder="Placa (Ej: ABC123)" 
                  maxLength={6}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
                <button type="submit" className="rounded-xl bg-emerald-600 px-6 font-bold text-white hover:bg-emerald-500 transition-colors">
                  Consultar
                </button>
              </form>

              {picoPlacaResult && (
                <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                  {picoPlacaResult}
                </div>
              )}

              <div className="rounded-xl overflow-hidden border border-white/10 opacity-80 hover:opacity-100 transition-opacity">
                <img src={picoPlacaImg} alt="Calendario" className="w-full h-auto" />
              </div>
            </div>

            <div ref={remindersRef}>
              <ReminderSubscriptionCard initialPlate={initialReminderPlate} autoLoadOnMount={autoLoadReminders} />
            </div>
          </section>

          {/* FORMULARIOS */}
          <section id="conductores" className="mb-20 grid lg:grid-cols-[1fr_1.5fr] gap-12 items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400 mb-4">
                CONVOCATORIA ABIERTA
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Únete como Conductor</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Accede a un vehículo en condiciones óptimas. Sin jefes, pero con el respaldo de un equipo que quiere verte crecer.
              </p>
              <ShareButton title="Conduce con AllAtYou" text="Oportunidad para conductores." hash="#conductores" colorClass="text-emerald-400" />
            </div>
            <div className="rounded-3xl border border-white/10 bg-[#101a33]/80 p-1">
               <DriverApplicationForm referralCode={referralCode || undefined} />
            </div>
          </section>

          <section id="propietarios" className="mb-20 grid lg:grid-cols-[1fr_1.5fr] gap-12 items-start lg:grid-flow-col-dense">
            <div className="lg:col-start-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400 mb-4">
                RENTABILIDAD SEGURA
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Registra tu Vehículo</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Convierte tu carro en un activo real. Nosotros gestionamos todo por ti.
              </p>
              <ShareButton title="Administración AllAtYou" text="Rentabiliza tu vehículo." hash="#propietarios" colorClass="text-blue-400" />
            </div>
            <div className="lg:col-start-1 rounded-3xl border border-white/10 bg-[#101a33]/80 p-1">
              <VehicleApplicationForm />
            </div>
          </section>

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
            <p>Mockup funcional v2.0 - Diseño híbrido operativo.</p>
          </footer>

        </div>
      </main>
    </div>
  );
}