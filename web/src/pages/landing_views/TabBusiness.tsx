import RegistrationCTA from "../../components/RegistrationCTA";

export function TabBusiness() {
  return (
    <div className="animate-in fade-in duration-500">
      <div className="mx-auto max-w-6xl px-4 mt-12">
        <section id="talleres" className="mb-20 relative">
          {/* Efecto de brillo de fondo para resaltar la sección SaaS */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-violet-600/10 via-fuchsia-600/10 to-transparent blur-3xl rounded-full" />

          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[10px] font-bold text-violet-400 mb-4 uppercase tracking-wider">
              Para Talleres Mecánicos
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
              El sistema operativo para tu <span className="text-violet-400">Taller</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
              Digitaliza tu operación, envía diagnósticos profesionales y conviértete en parte de nuestra red de confianza. Toma el control total.
            </p>
          </div>

          <div className="mx-auto max-w-4xl flex justify-center">
            <RegistrationCTA />
          </div>
        </section>
      </div>
    </div>
  );
}
