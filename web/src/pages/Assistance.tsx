import { useState } from "react";
import {
  ShieldCheck,
  Wrench,
  FileSearch,
  BellRing,
  HeartHandshake,
  CheckCircle2,

  Phone,
  Star,
  Truck,
  Users,
  Zap,
  Handshake,
  ChevronDown
} from "lucide-react";

const WA_BASE = "https://wa.me/573238035356?text=";

interface Plan {
  id: string;
  name: string;
  price: string;
  priceSuffix: string;
  icon: React.ReactNode;
  benefits: string[];
  highlight?: boolean;
  badge?: string;
}

const PLANS: Plan[] = [
  {
    id: "vip",
    name: "Asistencia VIP",
    price: "$375.000",
    priceSuffix: "/ mes",
    icon: <Star className="w-6 h-6" />,
    highlight: true,
    badge: "⭐ Más Completo",
    benefits: [
      "4 lavadas al mes (1 detallada)",
      "Revisión de multas",
      "Recordatorio de SOAT y Tecnomecánica",
      "Calibración de ruedas",
      "Alineación y balanceo (cada 4 meses)",
      "Revisión de niveles de aceite",
      "Revisión de amortiguación y ruidos",
      "Asistencia de grúa",
    ],
  },
  {
    id: "basico",
    name: "Plan Básico / Preventivo",
    price: "$180.000",
    priceSuffix: "/ mes",
    icon: <ShieldCheck className="w-6 h-6" />,
    benefits: [
      "Revisión semanal de multas",
      "Recordatorios automáticos de legales",
      "1 Lavada sencilla",
      "Atención presencial en carretera",
      "Apoyo en accidentes",
      "Gestión de Reparaciones",
    ],
  },
  {
    id: "sos",
    name: "Plan SOS / Asistencia en Vía",
    price: "$75.000",
    priceSuffix: "/ mes",
    icon: <Zap className="w-6 h-6" />,
    badge: "🚨 Esencial",
    benefits: [
      "Atención presencial en carretera",
      "Asistencia en choque",
      "Revisión de multas",
      "Asistencia de grúa (pago adicional por distancia)",
      "Paso de corriente",
      "Cambio de llanta",
      "Apertura de puertas",
    ],
  },
  {
    id: "flotas",
    name: "Asistencia para Flotas",
    price: "$11.900",
    priceSuffix: "diario / vehículo",
    icon: <Truck className="w-6 h-6" />,
    benefits: [
      "Revisión de multas",
      "Revisión periódica de vehículos",
      "Monitoreo en mapa",
      "Entrevista con visita domiciliaria (cobro único ingreso $100.000)",
      "Asistencia de grúa (pago adicional por distancia)",
    ],
  },
  {
    id: "socio",
    name: "Plan Socio AllAtYou",
    price: "50%",
    priceSuffix: "comisión sobre alquileres",
    icon: <Handshake className="w-6 h-6" />,
    benefits: [
      "Gestión de entrega y recepción a locatarios",
      "Revisión de inventario de daños (check-in / check-out)",
      "Reporte mensual de rentabilidad y mantenimientos",
    ],
  },
];

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

      {/* 2. PRECIOS Y CTA */}
      <section id="precios" className="py-20 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs font-bold tracking-widest uppercase mb-4">
              Planes y Precios
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Elige el plan que se adapta a ti
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto">
              Desde protección básica hasta cobertura VIP total. Todos los planes incluyen atención humana real.
            </p>
          </div>

          {/* Planes Personales B2C — VIP en el centro */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <PricingCard plan={PLANS[1]} />{/* Básico */}
            <PricingCard plan={PLANS[0]} />{/* VIP — centro */}
            <PricingCard plan={PLANS[2]} />{/* SOS */}
          </div>

          {/* Planes Empresariales B2B */}
          <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mt-20 mb-8 text-center">
            Para Empresas e Inversionistas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <PricingCard plan={PLANS[3]} />{/* Flotas */}
            <PricingCard plan={PLANS[4]} />{/* Socio AllAtYou */}
          </div>

          <p className="text-center text-xs text-slate-400 mt-10">
            * Precios en COP. Algunos planes pueden tener costos adicionales según distancia o condición del vehículo.
          </p>

          {/* Banner de Prueba Social */}
          <div className="max-w-4xl mx-auto mt-12 bg-emerald-50 border border-emerald-100 p-6 md:p-8 rounded-3xl text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <Users className="w-7 h-7" />
              </div>
            </div>
            <p className="text-slate-700 font-semibold text-lg md:text-xl max-w-xl mx-auto leading-snug">
              Más de <span className="text-emerald-600 font-extrabold">20 conductores</span> en Cali y el Valle del Cauca ya confían su tranquilidad en nosotros.
            </p>
          </div>
        </div>
      </section>

      {/* 3. ALCANCE DEL SERVICIO (GRID) */}
      <section className="py-20 px-6 bg-white">
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
                <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4" /> Atención Humana</li>
                <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4" /> Ahorro de dinero</li>
                <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4" /> Red de confianza</li>
              </ul>
            </div>
          </div>
        </div>
      </section>




      {/* 4. PREGUNTAS FRECUENTES */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block py-1 px-3 rounded-full bg-slate-100 text-slate-500 text-xs font-bold tracking-widest uppercase mb-4">
              FAQ
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Preguntas Frecuentes
            </h2>
          </div>
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
            <FaqItem
              question="¿La asistencia funciona de madrugada?"
              answer="Sí. Nuestra asistencia para emergencias en carretera opera 24/7 para que nunca te quedes tirado, sin importar la hora."
            />
            <FaqItem
              question="¿Los planes tienen cláusula de permanencia?"
              answer="Para nada. Nuestros planes mensuales no tienen ataduras; puedes cancelar o pausar tu suscripción en cualquier momento."
            />
            <FaqItem
              question="¿El plan cubre el costo de los repuestos?"
              answer="No. Los planes cubren toda la gestión, coordinación y diagnósticos. Los repuestos y mano de obra de asistencia los asume el cliente, pero usamos nuestra red de aliados para conseguirlos a precio justo y sin sobrecostos."
            />
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

function PricingCard({ plan }: { plan: Plan }) {
  const waLink = `${WA_BASE}${encodeURIComponent(`Hola, me interesa el ${plan.name} de AllAtYou.`)}`;

  if (plan.highlight) {
    return (
      <div className="relative bg-slate-900 text-white rounded-3xl border-2 border-emerald-400 shadow-2xl shadow-emerald-900/30 p-8 flex flex-col sm:col-span-2 xl:col-span-1 hover:-translate-y-1 transition-transform duration-300">
        {plan.badge && (
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-emerald-400 text-slate-900 text-xs font-extrabold px-4 py-1.5 rounded-full shadow-lg">
            {plan.badge}
          </span>
        )}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
            {plan.icon}
          </div>
          <h3 className="text-xl font-bold">{plan.name}</h3>
        </div>
        <div className="flex items-baseline gap-2 mb-8">
          <span className="text-4xl font-extrabold text-emerald-400">{plan.price}</span>
          <span className="text-sm text-slate-400 font-medium">{plan.priceSuffix}</span>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded">COP</span>
        </div>
        <ul className="space-y-3 mb-8 flex-1">
          {plan.benefits.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              {b}
            </li>
          ))}
        </ul>
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className="block w-full text-center py-3.5 rounded-xl bg-emerald-400 text-slate-900 font-bold hover:bg-emerald-300 transition-all shadow-lg shadow-emerald-900/40"
        >
          Contratar Ahora
        </a>
      </div>
    );
  }

  return (
    <div className="relative bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-8 flex flex-col">
      {plan.badge && (
        <span className="absolute -top-4 left-8 whitespace-nowrap bg-slate-900 text-white text-xs font-extrabold px-4 py-1.5 rounded-full shadow">
          {plan.badge}
        </span>
      )}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          {plan.icon}
        </div>
        <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
      </div>
      <div className="flex items-baseline gap-2 mb-8">
        <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
        <span className="text-sm text-slate-500 font-medium leading-tight">{plan.priceSuffix}</span>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">COP</span>
      </div>
      <ul className="space-y-3 mb-8 flex-1">
        {plan.benefits.map((b, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            {b}
          </li>
        ))}
      </ul>
      <a
        href={waLink}
        target="_blank"
        rel="noreferrer"
        className="block w-full text-center py-3.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-700 transition-all"
      >
        Contratar Ahora
      </a>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold text-slate-900 text-sm md:text-base">{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-emerald-500 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-6 pb-5">
          <p className="text-slate-500 text-sm leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}