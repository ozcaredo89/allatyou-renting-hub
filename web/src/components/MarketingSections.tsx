export function ProcessSteps() {
  const steps = [
    { num: 1, title: "Registro", desc: "Datos básicos del vehículo y validación de documentos." },
    { num: 2, title: "Reglas Claras", desc: "Firma de contrato: definimos pagos, daños y deducibles." },
    { num: 3, title: "Asignación", desc: "Filtramos conductores con antecedentes y experiencia verificada." },
    { num: 4, title: "Operación", desc: "Gestión diaria de turnos, novedades y mantenimiento." },
    { num: 5, title: "Liquidación", desc: "Recibes tu reporte financiero y tu pago neto." },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {steps.map((s) => (
        <div key={s.num} className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-bold text-emerald-400 border border-emerald-500/30">
            {s.num}
          </div>
          <h4 className="mb-2 text-sm font-bold text-white">{s.title}</h4>
          <p className="text-xs leading-relaxed text-slate-400">{s.desc}</p>
        </div>
      ))}
    </div>
  );
}

export function MoneyFlow() {
  return (
    <div className="space-y-4">
      {/* Barra visual */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <strong className="text-sm text-white">Ingreso Bruto</strong>
        <div className="h-3 flex-1 min-w-[150px] overflow-hidden rounded-full bg-white/5 border border-white/10">
          <div className="h-full w-full bg-gradient-to-r from-emerald-600 to-emerald-400 opacity-90" />
        </div>
        <span className="text-xs text-slate-400">100%</span>
      </div>
      
      {/* Leyenda */}
      <div className="flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">– Pago conductor (Gasolina/Lavada)</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">– Gastos Mantenimiento</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">– Comisión AllAtYou (50% Utilidad)</span>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-400 font-bold">= Neto Propietario</span>
      </div>
    </div>
  );
}

export function FaqSection() {
  const faqs = [
    { q: "¿Qué pasa si hay un choque?", a: "El vehículo debe tener seguro todo riesgo. El conductor paga el deducible si es culpable. Nosotros gestionamos el trámite." },
    { q: "¿Quién paga los comparendos?", a: "El conductor responsable. Se descuenta de su depósito o liquidación. Tenemos trazabilidad de quién tenía el carro." },
    { q: "¿Cuándo recibo mi dinero?", a: "Las liquidaciones se generan periódicamente (semanal o quincenal según acuerdo) y se transfieren a tu cuenta bancaria." },
    { q: "¿Qué requisitos piden?", a: "Vehículo modelo 2020 en adelante (preferiblemente), SOAT y Tecno vigentes, Seguro Todo Riesgo." },
  ];

  return (
    <div className="space-y-3">
      {faqs.map((f, i) => (
        <details key={i} className="group rounded-2xl border border-white/10 bg-white/5 p-4 open:bg-white/[0.07]">
          <summary className="cursor-pointer text-sm font-bold text-white list-none flex justify-between items-center">
            {f.q}
            <span className="text-slate-500 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">{f.a}</p>
        </details>
      ))}
    </div>
  );
}