import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Logo from "../components/Logo";
import { TrustSection } from "../components/TrustSection";
import { FaqSection } from "../components/MarketingSections";

import { TabIncome } from "./landing_views/TabIncome";
import { TabBusiness } from "./landing_views/TabBusiness";
import { TabServices } from "./landing_views/TabServices";

const WHATSAPP_URL = "https://wa.me/573113738912?text=Hola%20AllAtYou%2C%20vengo%20de%20la%20web%20y%20quiero%20m%C3%A1s%20info.";

type TabId = "ingresos" | "negocios" | "servicios";

export default function Landing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Determinar la pestaña activa
  const activeTabFromUrl = searchParams.get("tab") as TabId | null;
  const activeTab: TabId = activeTabFromUrl === "negocios" || activeTabFromUrl === "servicios" 
    ? activeTabFromUrl 
    : "ingresos";

  const handleTabChange = (tabId: TabId) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", tabId);
    setSearchParams(newParams);
  };

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        const element = document.getElementById(hash.replace("#", ""));
        if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 600);
    }
    const ref = searchParams.get("ref");
    if (ref) setReferralCode(ref);
  }, [searchParams]);

  return (
    <div className="min-h-screen font-sans text-[#eaf0ff] selection:bg-emerald-500/30 selection:text-emerald-200"
         style={{
           backgroundColor: "#0b1220",
           backgroundImage: `
             radial-gradient(900px 500px at 20% 10%, rgba(16, 185, 129, 0.15), transparent 65%),
             radial-gradient(700px 450px at 85% 35%, rgba(124, 92, 255, 0.10), transparent 60%),
             radial-gradient(900px 600px at 50% 120%, rgba(251, 191, 36, 0.05), transparent 60%)
           `
         }}>

      {/* NAVBAR */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b1220]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center">
             <Logo className="h-9 md:h-10 w-auto" />
          </div>

          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-400">
            {activeTab === 'ingresos' && (
              <>
                <a href="#como" className="hover:text-white transition-colors">Cómo funciona</a>
                <a href="#flujo" className="hover:text-white transition-colors">Dinero</a>
              </>
            )}
            {activeTab === 'negocios' && (
              <a href="#talleres" className="hover:text-white transition-colors">Software para Talleres</a>
            )}
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>
          <div className="flex gap-3">
             <a href={WHATSAPP_URL} target="_blank" className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 transition-all">
               WhatsApp
             </a>
          </div>
        </div>
      </header>

      {/* SELECTOR DE PESTAÑAS (TABS) */}
      <div className="border-b border-white/5 bg-white/[0.01]">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex overflow-x-auto whitespace-nowrap gap-2 py-4 pb-2 scrollbar-hide">
            <button
              onClick={() => handleTabChange('ingresos')}
              className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-bold transition-all ${
                activeTab === 'ingresos' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              💰 Genera Ingresos
            </button>
            <button
              onClick={() => handleTabChange('servicios')}
              className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-bold transition-all ${
                activeTab === 'servicios' 
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              🚗 Para tu Vehículo
            </button>
            <button
              onClick={() => handleTabChange('negocios')}
              className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-bold transition-all ${
                activeTab === 'negocios' 
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              🏢 Para Negocios
            </button>
          </div>
        </div>
      </div>

      <main className="pb-20 pt-10">
        {/* RENDERIZADO CONDICIONAL POR CSS (Evita unmount y pérdida de estado) */}
        <div className={activeTab === 'ingresos' ? 'block' : 'hidden'}>
          <TabIncome referralCode={referralCode} />
        </div>
        
        <div className={activeTab === 'servicios' ? 'block' : 'hidden'}>
          <TabServices />
        </div>

        <div className={activeTab === 'negocios' ? 'block' : 'hidden'}>
          <TabBusiness />
        </div>

        {/* SECCIONES GLOBALES */}
        <div className="mx-auto max-w-6xl px-4 mt-12">
          <TrustSection />

          <section id="faq" className="mb-20 rounded-3xl border border-white/10 bg-[#101a33]/50 p-8">
              <h2 className="text-2xl font-bold text-white mb-6">Preguntas frecuentes</h2>
              <FaqSection />
          </section>
        </div>
      </main>

      <footer className="border-t border-white/10 pt-12 pb-8 text-center text-xs text-slate-500">
        <div className="flex justify-center gap-6 mb-8">
          <a href={WHATSAPP_URL} className="hover:text-emerald-400 transition-colors">WhatsApp Soporte</a>
          <a href="mailto:contacto@allatyou.com" className="hover:text-emerald-400 transition-colors">Email</a>
        </div>
        <p className="mb-2">© {new Date().getFullYear()} AllAtYou Renting S.A.S — NIT 901.995.593 — Cali, Colombia.</p>
      </footer>
    </div>
  );
}