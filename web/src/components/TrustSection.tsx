import { Check } from "lucide-react";

export function TrustSection() {
  return (
    <section className="mb-20">
      <div className="rounded-3xl border border-white/10 bg-[#0f172a]/50 p-8 md:p-12">
        <div className="max-w-3xl mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Por qué esto no es un salto al vacío
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            En este negocio se vende más por controles que por promesas. 
            Aquí están los <span className="text-emerald-400 font-bold">"candados" de seguridad</span> que protegen tu activo.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <TrustCard 
            title="Selección de conductores"
            desc="Proceso de verificación riguroso + reglas claras de operación y convivencia."
          />
          <TrustCard 
            title="Contratos y trazabilidad"
            desc="Condiciones escritas: responsabilidad, liquidación, deducciones y novedades claras."
          />
          <TrustCard 
            title="Reportes y soporte"
            desc="Reportes periódicos + canal dedicado para incidentes (mecánica, accidentes, comparendos)."
          />
        </div>
      </div>
    </section>
  );
}

function TrustCard({ title, desc }: { title: string, desc: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#1e293b]/50 p-6 hover:bg-[#1e293b] transition-colors group">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
        <Check className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">
        {desc}
      </p>
    </div>
  );
}