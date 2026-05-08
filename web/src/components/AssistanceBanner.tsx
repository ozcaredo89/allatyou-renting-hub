import { ShieldCheck, ArrowRight, Star } from "lucide-react";
import { Link } from "react-router-dom";

const BADGES = ["Grúa 24/7", "Gestión Legal", "Mecánica Preventiva"] as const;

export function AssistanceBanner() {
  return (
    <section className="py-10 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 to-[#0B1221] border border-emerald-500/30 shadow-2xl shadow-emerald-900/20 group">

          {/* Fondos decorativos */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-emerald-600/10 to-transparent" />
          {/* Glow sutil en la esquina inferior izquierda */}
          <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between p-8 md:p-12 gap-8">

            {/* ── Bloque de Texto ── */}
            <div className="flex-1 text-center md:text-left">

              {/* Badge superior */}
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 mb-4">
                <Star className="w-3 h-3 fill-emerald-400" />
                NUEVOS PLANES DE ASISTENCIA
              </div>

              {/* Título */}
              <h2 className="text-2xl md:text-4xl font-bold text-white mb-3 leading-tight">
                Tranquilidad total en la vía,{" "}
                <span className="text-emerald-400">diseñada a tu medida.</span>
              </h2>

              {/* Subtítulo con precio resaltado */}
              <p className="text-slate-400 text-base md:text-lg mb-5 max-w-xl">
                No esperes a vararte. Descubre nuestros planes de protección para conductores, flotas y propietarios. Cobertura integral desde{" "}
                <span className="text-emerald-400 font-bold">$75.000/mes</span>.
              </p>

              {/* Micro-badges de beneficios */}
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                {BADGES.map((badge) => (
                  <span
                    key={badge}
                    className="bg-white/5 border border-white/10 text-slate-300 text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md font-semibold"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>

            {/* ── CTA ── */}
            <div className="shrink-0 flex flex-col items-center gap-1">
              <Link
                to="/assistance"
                className="group flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-8 py-4 rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-emerald-500/20 whitespace-nowrap"
              >
                Ver Planes de Asistencia
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <p className="text-[10px] text-slate-400 mt-1 text-center">
                Sin cláusulas de permanencia.
              </p>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}