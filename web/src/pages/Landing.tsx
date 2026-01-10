import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import picoPlacaImg from "../assets/pico-placa.png";
import { DriverApplicationForm } from "../components/DriverApplicationForm";
import { VehicleApplicationForm } from "../components/VehicleApplicationForm";
import { ReminderSubscriptionCard } from "../components/ReminderSubscriptionCard";
import { ShareButton } from "../components/ShareButton";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

const WHATSAPP_URL =
  "https://wa.me/573113738912?text=Hola%20AllAtYou%2C%20quiero%20informaci%C3%B3n%20sobre%20el%20renting%20de%20veh%C3%ADculos.";

const PICO_PLACA_RULES: Record<number, string> = {
  0: "El pico y placa es el día Viernes (mañana y tarde) para placas terminadas en 0.",
  1: "El pico y placa es el día Lunes (mañana y tarde) para placas terminadas en 1.",
  2: "El pico y placa es el día Lunes (mañana y tarde) para placas terminadas en 2.",
  3: "El pico y placa es el día Martes (mañana y tarde) para placas terminadas en 3.",
  4: "El pico y placa es el día Martes (mañana y tarde) para placas terminadas en 4.",
  5: "El pico y placa es el día Miercoles (mañana y tarde) para placas terminadas en 5.",
  6: "El pico y placa es el día Miercoles (mañana y tarde) para placas terminadas en 6.",
  7: "El pico y placa es el día Jueves (mañana y tarde) para placas terminadas en 7.",
  8: "El pico y placa es el día Jueves (mañana y tarde) para placas terminadas en 8.",
  9: "El pico y placa es el día Viernes (mañana y tarde) para placas terminadas en 9.",
};

export default function Landing() {
  const [plateQuery, setPlateQuery] = useState("");
  const [picoPlacaResult, setPicoPlacaResult] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  const [landingViews, setLandingViews] = useState<number | null>(null);
  // CORRECCIÓN: Eliminado picoPlacaUses porque no se visualiza en la UI

  const [initialReminderPlate, setInitialReminderPlate] = useState<string | undefined>(undefined);
  const [autoLoadReminders, setAutoLoadReminders] = useState(false);
  const remindersRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function trackAndLoadMetrics() {
      [cite_start]// 1. Registrar visita (Métrica backend) [cite: 15]
      try {
        await fetch(`${API}/metrics/landing-view`, { method: "POST" });
      } catch {}

      // 2. Traer resumen (Solo necesitamos landing_views para mostrar)
      try {
        const rs = await fetch(`${API}/metrics/summary`);
        if (!rs.ok) return;
        const json = await rs.json();
        setLandingViews(json.landing_views ?? null);
      } catch {}
    }

    trackAndLoadMetrics();

    try {
      const params = new URLSearchParams(window.location.search);
      const rawPlate = params.get("plate");
      const focus = params.get("focus");
      const ref = params.get("ref");

      if (ref) setReferralCode(ref);

      if (rawPlate) {
        const normalized = rawPlate
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 6);

        if (normalized) {
          setInitialReminderPlate(normalized);
          setAutoLoadReminders(true);
        }
      }

      if (focus === "reminders") {
        setTimeout(() => {
          if (remindersRef.current) {
            remindersRef.current.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }
        }, 300);
      }
    } catch {}
  }, []);

  function handleCheckPicoPlaca(e: FormEvent) {
    e.preventDefault();
    const clean = plateQuery.replace(/\s+/g, "").toUpperCase();

    if (!clean) {
      setPicoPlacaResult("Ingresa una placa válida (ej: ABC123).");
      return;
    }

    const match = clean.match(/(\d)$/);
    if (!match) {
      setPicoPlacaResult(
        "No encontramos un número al final de la placa. Verifica el formato (ej: ABC123)."
      );
      return;
    }

    const lastDigit = Number(match[1]);
    const rule = PICO_PLACA_RULES[lastDigit]; [cite_start]// [cite: 10]

    if (!rule) {
      setPicoPlacaResult(
        `Para placas terminadas en ${lastDigit}, revisa el cuadro de pico y placa.`
      );
    } else {
      setPicoPlacaResult(`Para placas terminadas en ${lastDigit}: ${rule}`);
    }

    [cite_start]// Registrar métrica en backend (sin actualizar estado local) [cite: 11]
    try {
      fetch(`${API}/metrics/pico-placa-use`, { method: "POST" });
    } catch {}
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 scroll-smooth">
      <div className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-slate-950">
              AY
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">
                AllAtYou Renting
              </span>
              <span className="text-xs text-slate-400">
                Tu carro, sin complicarte la vida
              </span>
            </div>
          </div>

          <div className="hidden gap-6 text-xs font-medium md:flex">
            <a href="#pico-placa" className="text-slate-300 hover:text-emerald-400 transition-colors">
              Pico y placa
            </a>
            <a href="#conductores" className="text-slate-300 hover:text-emerald-400 transition-colors">
              Soy Conductor
            </a>
            <a href="#propietarios" className="text-slate-300 hover:text-emerald-400 transition-colors">
              Soy Propietario
            </a>
            <a href="#contacto" className="text-slate-300 hover:text-emerald-400 transition-colors">
              Contacto
            </a>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-12 pt-10 md:flex-row md:items-center">
        <div className="flex-1">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Renting y administración de vehículos
          </p>
          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Tu carro trabajando por ti,
            <span className="block text-emerald-400">
              con números claros.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300">
            AllAtYou Renting S.A.S se encarga de la operación diaria: pagos,
            conductores y mantenimiento. Tú ves todo en limpio y decides con tranquilidad.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#propietarios"
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-all"
            >
              Registrar mi vehículo
            </a>
            <a
              href="#conductores"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition-all"
            >
              Quiero conducir
            </a>
          </div>
        </div>

        <div className="flex-1">
          <div className="mx-auto max-w-sm rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-emerald-500/10">
            <div className="mb-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>Resumen ejemplo</span>
              <span>AllAtYou Hub</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-2">
                <span className="text-slate-300">Vehículos activos</span>
                <span className="font-semibold text-emerald-400">13</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-2">
                <span className="text-slate-300">Pagos recibidos hoy</span>
                <span className="font-semibold text-emerald-400">$XXX.XXX</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-2">
                <span className="text-slate-300">Vehículos en mora</span>
                <span className="font-semibold text-amber-300">0</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Gestión en tiempo real para tu tranquilidad financiera.
            </p>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="border-t border-white/5 bg-slate-950 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-xl font-semibold text-white sm:text-2xl">
            ¿Qué hacemos en AllAtYou?
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-300">
            Conectamos dueños de vehículos con conductores responsables bajo un modelo de renting justo.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-white/5 bg-slate-900/50 p-6 hover:bg-slate-900 transition-colors">
              <div className="mb-4 text-3xl">🚗</div>
              <p className="text-sm font-semibold text-white">Renting para conductores</p>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Sin cuota inicial astronómica. Paga una renta diaria justa y trabaja con libertad.
              </p>
            </div>
            <div className="rounded-3xl border border-white/5 bg-slate-900/50 p-6 hover:bg-slate-900 transition-colors">
              <div className="mb-4 text-3xl">📈</div>
              <p className="text-sm font-semibold text-white">Gestión para propietarios</p>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Olvídate de cobrar, de los talleres y de los dolores de cabeza. Nosotros administramos tu activo.
              </p>
            </div>
            <div className="rounded-3xl border border-white/5 bg-slate-900/50 p-6 hover:bg-slate-900 transition-colors">
              <div className="mb-4 text-3xl">🛡️</div>
              <p className="text-sm font-semibold text-white">Seguridad y Control</p>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Monitoreo satelital, seguros y una plataforma tecnológica para que sepas dónde está tu dinero.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pico y Placa (Layout 50/50 Optimizado) */}
      <section id="pico-placa" className="border-t border-white/5 bg-slate-900/20 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-white">Herramientas para tu día a día</h2>
            <p className="text-sm text-slate-400">Consulta Pico y Placa y configura recordatorios automáticos.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Columna Izquierda: Consulta y Calendario */}
            <div>
              <div className="rounded-2xl border border-emerald-500/20 bg-slate-950 p-6 mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-500 mb-3">Consulta Rápida</h3>
                <form onSubmit={handleCheckPicoPlaca} className="flex gap-2">
                  <input 
                    value={plateQuery}
                    onChange={(e) => setPlateQuery(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    placeholder="Placa (Ej: ABC123)" 
                    maxLength={6}
                    className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button type="submit" className="rounded-xl bg-emerald-500 px-6 font-bold text-slate-950 hover:bg-emerald-400 transition-colors">
                    Ir
                  </button>
                </form>
                
                {picoPlacaResult && (
                  <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-400 border border-emerald-500/20">
                    {picoPlacaResult}
                  </div>
                )}
                
                {landingViews && (
                  <p className="mt-3 text-[10px] text-slate-600">
                    Esta herramienta ha sido utilizada hoy.
                  </p>
                )}
              </div>
              
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-slate-950">
                <img 
                  src={picoPlacaImg} 
                  alt="Calendario Oficial Pico y Placa" 
                  className="w-full h-auto object-contain opacity-90 hover:opacity-100 transition-opacity" 
                />
              </div>
            </div>

            {/* Columna Derecha: Tarjeta de Recordatorios */}
            <div ref={remindersRef}>
              <ReminderSubscriptionCard 
                initialPlate={initialReminderPlate} 
                autoLoadOnMount={autoLoadReminders} 
              />
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN CONDUCTORES */}
      <section id="conductores" className="border-t border-white/5 bg-slate-950 py-20 relative overflow-hidden">
        {/* Decoración de fondo */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[100px]" />
        
        <div className="mx-auto max-w-5xl px-4 flex flex-col md:flex-row gap-16 items-start relative z-10">
          <div className="flex-1 md:sticky md:top-24">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400 mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              CONVOCATORIA ABIERTA
            </div>
            <h2 className="text-3xl font-bold text-white">Únete como Conductor</h2>
            <p className="mt-4 text-slate-400 text-sm leading-relaxed">
              Accede a un vehículo en condiciones óptimas. Sin jefes, pero con el respaldo de un equipo que quiere verte crecer.
            </p>
            
            <div className="mt-6 mb-8">
              <ShareButton 
                title="Conduce con AllAtYou" 
                text="¡Hola! Mira esta oportunidad para trabajar conduciendo con vehículos de AllAtYou."
                hash="#conductores"
                colorClass="text-emerald-400"
              />
            </div>
            
            <ul className="space-y-4">
              {[
                "Vehículos asegurados y con mantenimiento al día.",
                "Plataforma transparente: sabes cuánto ganas.",
                "Soporte operativo en caso de accidentes o varadas."
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] text-emerald-400">✓</div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 w-full max-w-md">
            <DriverApplicationForm referralCode={referralCode || undefined} />
          </div>
        </div>
      </section>

      {/* 3. NUEVA SECCIÓN: PROPIETARIOS (Layout Invertido) */}
      <section id="propietarios" className="border-t border-white/5 bg-slate-900/30 py-20">
        <div className="mx-auto max-w-5xl px-4 flex flex-col md:flex-row-reverse gap-16 items-start">
          <div className="flex-1 md:sticky md:top-24">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400 mb-4">
              RENTABILIDAD Y CONTROL
            </div>
            <h2 className="text-3xl font-bold text-white">Registra tu Vehículo</h2>
            <p className="mt-4 text-slate-400 text-sm leading-relaxed">
              Convierte tu carro en un activo real. Nosotros nos encargamos de conseguir el conductor, administrar los pagos y cuidar tu patrimonio.
            </p>

            <div className="mt-6 mb-8">
              <ShareButton 
                title="Administración de Vehículos AllAtYou" 
                text="¡Hola! Te recomiendo AllAtYou para que pongas a producir tu vehículo con tranquilidad."
                hash="#propietarios"
                colorClass="text-blue-400"
              />
            </div>
            
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xl">🤝</div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Selección Rigurosa</h4>
                  <p className="mt-1 text-xs text-slate-400">Validamos antecedentes, experiencia y vivienda de cada conductor.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xl">📱</div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Control Total</h4>
                  <p className="mt-1 text-xs text-slate-400">Acceso a nuestra App para ver la producción de tu carro en tiempo real.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 w-full max-w-md">
            <VehicleApplicationForm />
          </div>
        </div>
      </section>

      {/* Contacto */}
      <footer id="contacto" className="border-t border-white/5 bg-slate-950 py-16">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <h2 className="text-2xl font-semibold text-white">¿Tienes dudas puntuales?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
            Nuestro equipo está listo para explicarte el modelo de negocio al detalle.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-emerald-600 px-8 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition-colors"
            >
              Hablemos por WhatsApp
            </a>
            <a
              href="mailto:contacto@allatyou.com"
              className="rounded-full border border-white/10 bg-white/5 px-8 py-3 text-sm font-bold text-white hover:bg-white/10 transition-colors"
            >
              Enviar Correo
            </a>
          </div>
          <div className="mt-12 border-t border-white/5 pt-8">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AllAtYou Renting S.A.S — NIT 901.995.593 — Cali, Colombia.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}