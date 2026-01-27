import { 
  ShieldCheck, 
  Wrench, 
  FileSearch, 
  BellRing, 
  HeartHandshake, 
  CheckCircle2, 
  AlertTriangle,
  Phone
} from "lucide-react";

export default function Assistance() {
  const whatsappLink = "https://wa.me/573238035356?text=Hola,%20me%20interesa%20el%20Plan%20de%20Asistencia%20Vehicular%20AllAtYou.";

  return (
    <div className="bg-white min-h-screen font-sans text-slate-900">
      
      {/* 1. HERO SECTION */}
      <section className="relative bg-slate-900 text-white py-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent"></div>
        
        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-bold tracking-widest uppercase mb-6">
            Nuevo Servicio Premium
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Cuando tu carro falla, <br className="hidden md:block" />
            <span className="text-emerald-400">ALLATYOU se hace cargo.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            No vendemos solo un servicio, vendemos <b>tranquilidad</b>. 
            Un plan integral de acompañamiento para que nunca estés solo en la vía.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href={whatsappLink} 
              target="_blank" 
              rel="noreferrer"
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-emerald-900/50 flex items-center justify-center gap-2"
            >
              <Phone className="w-5 h-5" />
              Solicitar Asistencia
            </a>
            <a 
              href="#precios" 
              className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-xl transition-all backdrop-blur-sm"
            >
              Ver Planes y Precios
            </a>
          </div>
        </div>
      </section>

      {/* 2. ALCANCE DEL SERVICIO (GRID) */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">¿Qué incluye tu tranquilidad?</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">
              Actuamos como tu gestor y aliado. No somos solo una grúa, somos tu equipo de soporte 24/7.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <ServiceCard 
              icon={<ShieldCheck className="w-8 h-8 text-emerald-600" />}
              title="Asistencia en Carretera"
              desc="Acompañamiento en fallas, choques o incidentes. Nosotros coordinamos la solución para que tú no te estreses."
            />
            <ServiceCard 
              icon={<Wrench className="w-8 h-8 text-emerald-600" />}
              title="Gestión de Reparaciones"
              desc="Acceso a red de mecánicos confiables, precios preferenciales y revisión de cotizaciones para evitar sobrecostos."
            />
            <ServiceCard 
              icon={<FileSearch className="w-8 h-8 text-emerald-600" />}
              title="Peritaje Vehicular"
              desc="Evaluación técnica profesional y recomendaciones antes de reparaciones mayores o procesos de compra/venta."
            />
            <ServiceCard 
              icon={<BellRing className="w-8 h-8 text-emerald-600" />}
              title="Recordatorios Legales"
              desc="Nunca más una multa por olvido. Te avisamos antes de que venza tu SOAT o tu Técnico-Mecánica."
            />
            <ServiceCard 
              icon={<HeartHandshake className="w-8 h-8 text-emerald-600" />}
              title="Apoyo en Accidentes"
              desc="Orientación inmediata en caso de tránsito, apoyo en conciliación y asesoría paso a paso."
            />
            
            <div className="bg-slate-900 rounded-2xl p-8 text-white flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ShieldCheck className="w-32 h-32" />
              </div>
              <h3 className="text-xl font-bold mb-2">Más que un seguro</h3>
              <p className="text-slate-300 text-sm mb-4">
                A diferencia de un auxilio puntual, nosotros llevamos el historial de tu carro y te educamos preventivamente.
              </p>
              <ul className="space-y-2 text-sm text-emerald-400 font-medium">
                <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4"/> Atención Humana</li>
                <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4"/> Ahorro de dinero</li>
                <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4"/> Red de confianza</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PRECIOS Y CTA */}
      <section id="precios" className="py-20 px-6">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col md:flex-row">
          
          <div className="p-10 md:w-3/5 flex flex-col justify-center">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Plan Mensual Integral</h3>
            <p className="text-slate-500 mb-6">
              Cobertura completa de gestión y acompañamiento. <br/>
              <span className="text-xs italic text-slate-400">*El precio puede variar según el modelo del vehículo.</span>
            </p>
            <div className="flex items-baseline gap-2 mb-8">
              <span className="text-5xl font-extrabold text-slate-900">$180.000</span>
              <span className="text-xl text-slate-500 font-medium">/ mes</span>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded ml-2">COP</span>
            </div>
            <a 
              href={whatsappLink}
              target="_blank" 
              rel="noreferrer"
              className="w-full block text-center py-4 rounded-xl bg-black text-white font-bold hover:bg-slate-800 transition-all"
            >
              Contratar Ahora
            </a>
          </div>

          <div className="bg-slate-50 p-10 md:w-2/5 border-l border-slate-100 flex flex-col justify-center">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Lo que debes saber</h4>
            <ul className="space-y-3">
              <li className="flex gap-3 text-sm text-slate-600">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <span>No incluye costo de repuestos.</span>
              </li>
              <li className="flex gap-3 text-sm text-slate-600">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <span>No incluye mano de obra de terceros.</span>
              </li>
              <li className="flex gap-3 text-sm text-slate-600">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span>Incluye gestión y coordinación 24/7.</span>
              </li>
              <li className="flex gap-3 text-sm text-slate-600">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span>Incluye diagnósticos preventivos.</span>
              </li>
            </ul>
          </div>

        </div>
      </section>

    </div>
  );
}

function ServiceCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
      <div className="mb-4 bg-emerald-50 w-16 h-16 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
      <p className="text-slate-500 leading-relaxed text-sm">
        {desc}
      </p>
    </div>
  );
}