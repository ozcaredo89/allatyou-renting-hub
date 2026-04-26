import { useState } from "react";
import { Calculator, Info, X } from "lucide-react"; 
import { DriverApplicationForm } from "../../components/DriverApplicationForm";
import { VehicleApplicationForm } from "../../components/VehicleApplicationForm";
import { ShareButton } from "../../components/ShareButton";
import { IncomeSimulator } from "../../components/IncomeSimulator";
import { ProcessSteps, MoneyFlow } from "../../components/MarketingSections";
import { ModelOverview } from "../../components/ModelOverview"; 

export function TabIncome({ referralCode }: { referralCode: string | null }) {
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mx-auto max-w-6xl px-4">
        <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center mb-12">
          {/* Left: Copy de Venta */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 shadow-2xl backdrop-blur-sm">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-400 mb-6">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"/>
              Marketplace: Propietarios ↔ Conductores
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-6 leading-[1.1]">
              Pon tu carro a producir <span className="text-emerald-400">sin manejarlo.</span>
            </h1>
            
            <p className="text-lg text-slate-400 mb-8 leading-relaxed max-w-xl">
              Asignamos un <strong className="text-slate-200">conductor verificado</strong>, administramos la operación y te liquidamos con números claros.
            </p>

            {/* === ZONA DE ACCIÓN === */}
            <div className="flex flex-col gap-6 mb-8">
              {/* Botones Principales */}
              <div className="flex flex-wrap gap-4">
                <a href="#simulador" className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-bold text-white shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 transition-all">
                  <Calculator className="w-4 h-4" />
                  Simular Ganancias
                </a>
                <a href="#como" className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-bold text-slate-200 hover:bg-white/10 transition-all">
                  <Info className="w-4 h-4" />
                  Cómo funciona
                </a>
              </div>
            </div>
            {/* === FIN ZONA DE ACCIÓN === */}

            {/* CHECKS DE CONFIANZA */}
            <div className="flex flex-wrap gap-3 mb-8">
              {["Conductores verificados", "Reportes + liquidación", "Soporte ante novedades"].map((text, i) => (
                <div key={i} className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-slate-300">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-slate-950 font-bold">✓</div>
                  {text}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8 border-t border-white/5">
              <a href="#propietarios" className="group block rounded-2xl border border-white/5 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all">
                <h3 className="font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">Soy Propietario →</h3>
                <p className="text-xs text-slate-400">Quiero rentabilizar mi activo con control.</p>
              </a>
              <a href="#conductores" className="group block rounded-2xl border border-white/5 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all">
                <h3 className="font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">Soy Conductor →</h3>
                <p className="text-xs text-slate-400">Busco vehículo para trabajar ya.</p>
              </a>
            </div>
          </div>

          {/* Right: Simulador */}
          <div id="simulador" className="relative z-10">
            <ModelOverview /> 
            <IncomeSimulator onAction={() => setShowRegisterModal(true)} />
          </div>
        </section>
      </div>

      <div className="mx-auto max-w-6xl px-4 mt-12">
        <section id="como" className="rounded-3xl border border-white/10 bg-[#101a33]/50 p-8 backdrop-blur-sm mb-16">
          <h2 className="text-2xl font-bold text-white mb-2">Cómo funciona (Propietarios)</h2>
          <p className="text-slate-400 mb-8 max-w-2xl">Tu carro entra a una operación administrada profesionalmente. Nosotros nos encargamos del "trabajo sucio".</p>
          <ProcessSteps />
        </section>

        <section id="flujo" className="rounded-3xl border border-white/10 bg-[#101a33]/50 p-8 backdrop-blur-sm mb-20 mt-10">
          <h2 className="text-2xl font-bold text-white mb-2">Flujo del dinero</h2>
          <p className="text-slate-400 mb-8">La confianza se construye con cuentas claras. Así se distribuye el ingreso.</p>
          <MoneyFlow />
        </section>

        <section id="conductores" className="mb-20 grid lg:grid-cols-[1fr_1.5fr] gap-12 items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400 mb-4">CONVOCATORIA ABIERTA</div>
            <h2 className="text-3xl font-bold text-white mb-4">Únete como Conductor</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">Accede a un vehículo en condiciones óptimas. Sin jefes, pero con el respaldo de un equipo que quiere verte crecer.</p>
            <ShareButton title="Conduce con AllAtYou" text="Oportunidad para conductores." hash="#conductores" colorClass="text-emerald-400" />
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#101a33]/80 p-1">
            <DriverApplicationForm referralCode={referralCode || undefined} />
          </div>
        </section>

        <section id="propietarios" className="mb-20 grid lg:grid-cols-[1fr_1.5fr] gap-12 items-start lg:grid-flow-col-dense">
          <div className="lg:col-start-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400 mb-4">RENTABILIDAD SEGURA</div>
            <h2 className="text-3xl font-bold text-white mb-4">Registra tu Vehículo</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">Convierte tu carro en un activo real. Nosotros gestionamos todo por ti.</p>
            <ShareButton title="Administración AllAtYou" text="Rentabiliza tu vehículo." hash="#propietarios" colorClass="text-blue-400" />
          </div>
          <div className="lg:col-start-1 rounded-3xl border border-white/10 bg-[#101a33]/80 p-1">
            <VehicleApplicationForm />
          </div>
        </section>
      </div>

      {showRegisterModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300 overflow-y-auto">
          <div className="relative w-full max-w-lg my-8">
             <button 
              onClick={() => setShowRegisterModal(false)}
              className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all"
            >
              <X className="w-8 h-8" />
            </button>
            <VehicleApplicationForm />
          </div>
        </div>
      )}
    </div>
  );
}
