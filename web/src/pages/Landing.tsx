import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import picoPlacaImg from "../assets/pico-placa.png";
import { DriverApplicationForm } from "../components/DriverApplicationForm";
import { ReminderSubscriptionCard } from "../components/ReminderSubscriptionCard";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const WHATSAPP_URL = "https://wa.me/573113738912?text=Hola%20AllAtYou%2C%20quiero%20informaci%C3%B3n%20sobre%20el%20renting.";

const PICO_PLACA_RULES: Record<number, string> = {
  0: "Jueves", 1: "Viernes", 2: "Viernes", 3: "Lunes", 4: "Lunes",
  5: "Martes", 6: "Martes", 7: "Miércoles", 8: "Miércoles", 9: "Jueves",
};

export default function Landing() {
  // Estados de lógica de negocio
  const [plateQuery, setPlateQuery] = useState("");
  const [picoPlacaResult, setPicoPlacaResult] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  
  // Estados de métricas
  const [landingViews, setLandingViews] = useState<number | null>(null);
  const [picoPlacaUses, setPicoPlacaUses] = useState<number | null>(null);

  // Estados recuperados para ReminderSubscriptionCard (CORREGIDO: Faltaban estas variables)
  const [initialReminderPlate, setInitialReminderPlate] = useState<string | undefined>(undefined);
  const [autoLoadReminders, setAutoLoadReminders] = useState(false);
  
  // Referencias para scroll (CORREGIDO: Tipos correctos para TypeScript)
  const remindersRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function init() {
      // 1. Registrar visita
      try { await fetch(`${API}/metrics/landing-view`, { method: "POST" }); } catch {}

      // 2. Cargar resumen de métricas
      try {
        const rs = await fetch(`${API}/metrics/summary`);
        if (rs.ok) {
          const json = await rs.json();
          setLandingViews(json.landing_views);
          setPicoPlacaUses(json.pico_placa_uses);
        }
      } catch {}

      // 3. Leer parámetros URL (Lógica restaurada del archivo original)
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      const rawPlate = params.get("plate");
      const focus = params.get("focus");

      if (ref) setReferralCode(ref);

      if (rawPlate) {
        const normalized = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
        if (normalized) {
          setInitialReminderPlate(normalized);
          setAutoLoadReminders(true);
        }
      }

      // Scroll automático si la URL lo pide
      if (focus === "reminders") {
        setTimeout(() => {
          remindersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 500);
      }
    }
    init();
  }, []);

  // Función corregida para aceptar Refs que pueden ser null
  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Lógica de Pico y Placa (Restaurada para usar las constantes)
  function handleCheckPicoPlaca(e: FormEvent) {
    e.preventDefault();
    const clean = plateQuery.replace(/\s+/g, "").toUpperCase();

    if (!clean) {
      setPicoPlacaResult("Ingresa una placa válida.");
      return;
    }

    const match = clean.match(/(\d)$/);
    if (!match) {
      setPicoPlacaResult("La placa debe terminar en número.");
      return;
    }

    const lastDigit = Number(match[1]);
    const rule = PICO_PLACA_RULES[lastDigit];
    setPicoPlacaResult(rule ? `Día de restricción: ${rule}` : "No encontramos regla para este dígito.");

    // Métrica
    try { fetch(`${API}/metrics/pico-placa-use`, { method: "POST" }); } catch {}
    setPicoPlacaUses((prev) => (prev == null ? prev : prev + 1));
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans">
      {/* Navbar con botón de acción */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-bold text-slate-950">AY</div>
            <span className="text-sm font-bold tracking-tight">AllAtYou <span className="text-emerald-400">Renting</span></span>
          </div>
          <button 
            onClick={() => scrollTo(formRef)}
            className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition-all"
          >
            Postularme
          </button>
        </div>
      </nav>

      {/* Hero: Prioridad Reclutamiento */}
      <header className="relative overflow-hidden px-4 pb-16 pt-12 md:pt-20">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-[10px] font-medium uppercase tracking-widest text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            Cupos disponibles para conductores
          </div>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight text-white md:text-6xl">
            Conduce tu futuro con <br />
            <span className="text-emerald-400">AllAtYou Renting</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Obtén un vehículo en excelentes condiciones, soporte 24/7 y la transparencia que mereces en tus pagos diarios.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button 
              onClick={() => scrollTo(formRef)}
              className="w-full sm:w-auto rounded-full bg-emerald-500 px-8 py-4 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-transform"
            >
              Comenzar mi postulación
            </button>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="w-full sm:w-auto rounded-full border border-white/10 bg-white/5 px-8 py-4 text-sm font-semibold hover:bg-white/10 transition-colors">
              Hablar con un asesor
            </a>
          </div>
        </div>
      </header>

      {/* Navegación Rápida */}
      <section className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Postulación", icon: "🚗", ref: formRef },
            { label: "Pico y Placa", icon: "🗓️", ref: remindersRef },
            { label: "Beneficios", icon: "💎", id: "#por-que" },
            { label: "Contacto", icon: "💬", id: "#contacto" }, // Ajustado ID
          ].map((item, i) => (
            <button 
              key={i}
              onClick={() => item.ref ? scrollTo(item.ref) : document.querySelector(item.id!)?.scrollIntoView({behavior:'smooth'})}
              className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-slate-900/50 p-6 hover:border-emerald-500/40 hover:bg-slate-900 transition-all group"
            >
              <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">{item.icon}</span>
              <span className="text-xs font-medium text-slate-300 group-hover:text-emerald-400">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Sección Formulario - PRIORIDAD 1 */}
      <section ref={formRef} className="mx-auto max-w-5xl px-4 py-16">
        <div className="flex flex-col gap-12 lg:flex-row items-start">
          <div className="flex-1 lg:sticky lg:top-24">
            <h2 className="text-3xl font-bold text-white">Únete a la flota</h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Completa el formulario en menos de 3 minutos. Buscamos conductores con compromiso y ganas de crecer bajo un esquema de renting justo y rentable.
            </p>
            <div className="mt-8 space-y-4">
              {["Vehículos modernos y mantenidos", "Cuentas claras en nuestra App propia", "Entregas semanales fijas de $330.000"].map((text, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-slate-300">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-400">✓</div>
                  {text}
                </div>
              ))}
            </div>
            {/* Dato de métrica visual opcional */}
             {(landingViews != null) && (
                <p className="mt-8 text-[10px] text-slate-600">
                  Esta oportunidad ha sido vista {landingViews} veces hoy.
                </p>
              )}
          </div>
          <div className="w-full max-w-md mx-auto">
            <DriverApplicationForm referralCode={referralCode || undefined} />
          </div>
        </div>
      </section>

      {/* Sección Pico y Placa Compacta */}
      <section id="pico-placa" className="border-t border-white/5 bg-slate-900/30 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-white">Herramientas AllAtYou</h2>
            <p className="text-sm text-slate-400">Consulta Pico y Placa y programa tus alertas de vencimientos.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 items-start bg-slate-900/80 rounded-3xl border border-white/5 p-6 md:p-10">
            {/* Columna Izquierda: Consulta y Foto */}
            <div>
              <h3 className="text-lg font-bold mb-4 text-white">Consulta Rápida</h3>
              <form onSubmit={handleCheckPicoPlaca} className="flex gap-2">
                <input 
                  value={plateQuery}
                  onChange={(e) => setPlateQuery(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder="Placa (Ej: ABC123)" 
                  maxLength={6}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button type="submit" className="rounded-xl bg-emerald-500 px-6 font-bold text-slate-950 hover:bg-emerald-400">
                  Ir
                </button>
              </form>
              
              {picoPlacaResult && (
                <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-400 border border-emerald-500/20">
                  {picoPlacaResult}
                </div>
              )}
              
              <div className="mt-8">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Calendario Oficial</p>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
                  <img src={picoPlacaImg} alt="Pico y placa" className="w-full object-contain opacity-80 hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>

            {/* Columna Derecha: Recordatorios */}
            <div ref={remindersRef}>
              <ReminderSubscriptionCard 
                initialPlate={initialReminderPlate} 
                autoLoadOnMount={autoLoadReminders} 
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer y Contacto Compacto */}
      <footer id="contacto" className="border-t border-white/5 bg-slate-950 py-12 px-4 text-center">
        <h3 className="text-lg font-semibold text-white mb-4">¿Tienes dudas?</h3>
        <div className="flex justify-center gap-4 mb-8">
           <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-sm text-emerald-400 hover:text-emerald-300 underline">WhatsApp</a>
           <a href="mailto:contacto@allatyou.com" className="text-sm text-emerald-400 hover:text-emerald-300 underline">Email</a>
        </div>
        <p className="text-xs text-slate-500">© 2026 AllAtYou Renting S.A.S — NIT 901.995.593 — Cali, Colombia.</p>
      </footer>
    </div>
  );
}