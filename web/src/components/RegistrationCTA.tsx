
import { Rocket, ArrowRight, CheckCircle2 } from "lucide-react";

export default function RegistrationCTA() {
  return (
    <div className="w-full max-w-md bg-gradient-to-br from-slate-900 via-indigo-900 to-emerald-900 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden">
      {/* Elemento decorativo de fondo */}
      <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10">
        <Rocket size={120} />
      </div>

      <div className="relative z-10">
        <h3 className="text-2xl font-bold mb-3 leading-tight">
          Lleva tu taller al siguiente nivel
        </h3>
        
        <p className="text-slate-300 mb-6 text-sm leading-relaxed">
          Digitaliza tus ingresos, envía diagnósticos profesionales y aumenta tu facturación sin complicaciones.
        </p>

        <ul className="space-y-3 mb-8">
          <li className="flex items-center gap-2 text-sm text-slate-200">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span>No requiere instalación</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-slate-200">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span>Soporte 24/7</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-slate-200">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span>Prueba gratis</span>
          </li>
        </ul>

        <a
          href={`${import.meta.env.VITE_TALLER_URL || "https://taller.allatyou.com"}/registro`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 px-6 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/20 w-full"
        >
          <span>Empieza tu prueba gratis</span>
          <ArrowRight size={20} />
        </a>
      </div>
    </div>
  );
}
