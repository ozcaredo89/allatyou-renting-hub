import { useState, useEffect, type ReactNode } from "react";
import { ensureBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type Company = { id: number; name: string };

interface Props {
  children: ReactNode; // El contenido protegido (La página de Utilidad)
}

export default function CompanyLock({ children }: Props) {
  // Estado de la sesión
  const [unlockedCompany, setUnlockedCompany] = useState<Company | null>(null);
  
  // Estado del formulario de bloqueo
  const [step, setStep] = useState<"SELECT" | "CODE">("SELECT");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  // 1. Al cargar, revisar si ya hay sesión válida (< 30 mins)
  useEffect(() => {
    const stored = sessionStorage.getItem("profit_auth");
    if (stored) {
      const session = JSON.parse(stored);
      const now = new Date().getTime();
      // Validar expiración (30 mins = 1800000 ms)
      if (now - session.timestamp < 1800000) {
        setUnlockedCompany(session.company);
        return;
      }
    }
    // Si no hay sesión válida, cargar empresas
    loadCompanies();
  }, []);

  async function loadCompanies() {
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/companies`, { headers: { Authorization: auth } });
      const data = await res.json();
      setCompanies(data);
      // Pre-seleccionar la primera si solo hay una
      if (data.length > 0) setSelectedCompany(data[0]);
    } catch (e) {
      console.error("Error cargando empresas", e);
    }
  }

  async function requestUnlock() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      await fetch(`${API}/companies/auth/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ companyId: selectedCompany.id }),
      });
      setStep("CODE"); // Pasar a pantalla de código
    } catch (e) {
      alert("Error enviando código");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/companies/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ companyId: selectedCompany.id, code }),
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      // ¡Éxito! Guardar sesión
      const sessionData = {
        company: selectedCompany,
        timestamp: new Date().getTime()
      };
      sessionStorage.setItem("profit_auth", JSON.stringify(sessionData));
      setUnlockedCompany(selectedCompany);

    } catch (e: any) {
      alert(e.message || "Código incorrecto");
    } finally {
      setLoading(false);
    }
  }

  function handleLogoutCompany() {
    sessionStorage.removeItem("profit_auth");
    setUnlockedCompany(null);
    setStep("SELECT");
    setCode("");
  }

  // --- RENDERIZADO ---

  // CASO 1: Desbloqueado -> Mostrar contenido + Botón de cambio
  if (unlockedCompany) {
    return (
      <div className="relative">
        {/* Barra superior de la empresa activa */}
        <div className="bg-slate-900 text-white px-6 py-2 flex justify-between items-center text-sm mb-4 rounded-xl shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">●</span>
            <span className="font-medium">Empresa: {unlockedCompany.name}</span>
          </div>
          <button 
            onClick={handleLogoutCompany}
            className="text-slate-300 hover:text-white underline decoration-dashed"
          >
            Cambiar Empresa
          </button>
        </div>
        
        {/* Contenido protegido (Página de Utilidad) */}
        {children}
      </div>
    );
  }

  // CASO 2: Bloqueado -> Pantalla de selección/código
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <span className="text-3xl">🔒</span>
        </div>
        
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Protegido</h2>
        <p className="text-slate-500 mb-6 text-sm">
          La información de rentabilidad es sensible. Selecciona la empresa y valida tu identidad.
        </p>

        {step === "SELECT" ? (
          <div className="space-y-4">
            <div className="text-left">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Empresa</label>
              <select 
                className="w-full rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-black"
                value={selectedCompany?.id}
                onChange={(e) => {
                  const c = companies.find(x => x.id === Number(e.target.value));
                  if (c) setSelectedCompany(c);
                }}
              >
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button
              onClick={requestUnlock}
              disabled={loading || !selectedCompany}
              className="w-full bg-black text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar Código de Acceso"}
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm mb-4">
              Hemos enviado un código a WhatsApp y Email de <b>{selectedCompany?.name}</b>.
            </div>
            <input 
              type="text" 
              inputMode="numeric"
              placeholder="000000"
              className="w-full text-center text-3xl tracking-widest font-mono border-b-2 border-slate-300 focus:border-black outline-none py-2"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g,''))}
            />
            <button
              onClick={verifyCode}
              disabled={loading || code.length < 6}
              className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              {loading ? "Verificando..." : "Desbloquear"}
            </button>
            <button 
              onClick={() => setStep("SELECT")}
              className="text-sm text-slate-400 hover:text-slate-600"
            >
              Volver atrás
            </button>
          </div>
        )}
      </div>
    </div>
  );
}