import { ShieldCheck, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function AssistanceBanner() {
  return (
    <section className="py-10 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 to-[#0B1221] border border-emerald-500/30 shadow-2xl shadow-emerald-900/20 group">
          
          {/* Fondo decorativo */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-emerald-600/10 to-transparent"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between p-8 md:p-12 gap-8">
            
            {/* Texto */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 mb-4">
                <ShieldCheck className="w-3 h-3" />
                NUEVO SERVICIO
              </div>
              <h2 className="text-2xl md:text-4xl font-bold text-white mb-3">
                ¿Tu carro ya tiene quién lo cuide?
              </h2>
              <p className="text-slate-400 text-base md:text-lg mb-0 max-w-xl">
                No esperes a vararte para buscar ayuda. Obtén asistencia vehicular integral, peritaje y gestión legal por solo <span className="text-white font-bold">$180.000/mes</span>.
              </p>
            </div>

            {/* CTA */}
            <div className="shrink-0">
              <Link 
                to="/assistance"
                className="group flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-8 py-4 rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-emerald-500/20"
              >
                Ver Planes de Asistencia
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}