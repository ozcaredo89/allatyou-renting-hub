export function ModelOverview() {
  const steps = [
    { 
      text: "Filtro estricto conductores", 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
      )
    },
    { 
      text: "Contrato entre Partes", 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z"/>
        </svg>
      )
    },
    { 
      text: "Control Operativo", 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
        </svg>
      )
    },
    { 
      text: "Agendamiento de Ingreso Pasivo", 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>
        </svg>
      ), 
      highlight: true 
    }
  ];

  return (
    <div className="mb-6 rounded-3xl border border-white/10 bg-[#0f172a]/80 p-6 backdrop-blur-sm shadow-2xl">
      <div className="mb-6 flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-white tracking-wide">Vista rápida del modelo</h3>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ciclo AllAtYou</span>
      </div>
      
      {/* CAMBIO CLAVE: flex-col en móvil, flex-row en md */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative">
        
        {/* Línea conectora vertical (visible solo en móvil) para unir visualmente */}
        <div className="absolute left-1/2 top-4 bottom-4 w-px bg-gradient-to-b from-white/5 via-white/10 to-white/5 -translate-x-1/2 md:hidden z-0"></div>

        {steps.map((step, i) => (
          <div key={i} className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto relative z-10">
            
            {/* El Chip (Tarjeta del paso) */}
            <div 
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold transition-all w-full md:w-auto justify-center md:justify-start shadow-lg
                ${step.highlight 
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
                  : "border-white/5 bg-[#1e293b] text-slate-200"
                }`}
            >
              <span className={`${step.highlight ? "text-emerald-400" : "text-slate-400"}`}>
                {step.icon}
              </span>
              {step.text}
            </div>

            {/* La Flecha (Lógica condicional para Responsive) */}
            {i < steps.length - 1 && (
              <>
                {/* Flecha Horizontal (Desktop) */}
                <div className="hidden md:block text-slate-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                  </svg>
                </div>
                
                {/* Flecha Vertical (Mobile) */}
                <div className="md:hidden text-slate-600">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>
                  </svg>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}