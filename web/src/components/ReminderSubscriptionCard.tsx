import { useEffect, useState } from "react";
import { 
  Search, 
  Calendar, 
  Clock, 
  Bell, 
  Mail, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  AlertCircle,
  Car
} from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

type ReminderSubscription = {
  plate: string;
  notify_soat: boolean;
  notify_tecno: boolean;
  notify_pico: boolean;
  days_before_soat: number;
  days_before_tecno: number;
  soat_notify_hour: number;
  tecno_notify_hour: number;
  pico_notify_hour: number;
  notification_email: string | null;
  notification_whatsapp: string | null;
  soat_expires_at: string | null;
  tecno_expires_at: string | null;
  city: string | null;
};

type Props = {
  initialPlate?: string;
  autoLoadOnMount?: boolean;
};

const HOUR_OPTIONS = [
  { value: 5, label: "05:00 AM" },
  { value: 10, label: "10:00 AM" },
  { value: 18, label: "06:00 PM" },
];

export function ReminderSubscriptionCard({ initialPlate, autoLoadOnMount }: Props) {
  const [plate, setPlate] = useState(() => (initialPlate || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
  
  // Estados
  const [notifySoat, setNotifySoat] = useState(true);
  const [notifyTecno, setNotifyTecno] = useState(true);
  const [notifyPico, setNotifyPico] = useState(false);
  
  const [daysBeforeSoat, setDaysBeforeSoat] = useState(15);
  const [daysBeforeTecno, setDaysBeforeTecno] = useState(10);
  
  const [soatHour, setSoatHour] = useState(18);
  const [tecnoHour, setTecnoHour] = useState(18);
  const [picoHour, setPicoHour] = useState(5);
  
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [soatDate, setSoatDate] = useState("");
  const [tecnoDate, setTecnoDate] = useState("");
  const [city, setCity] = useState("Cali"); // Default Cali para UX

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  const plateFormatValid = PLATE_RE.test(plate);

  function hydrateFrom(sub: ReminderSubscription) {
    setNotifySoat(sub.notify_soat);
    setNotifyTecno(sub.notify_tecno);
    setNotifyPico(sub.notify_pico);
    setDaysBeforeSoat(sub.days_before_soat);
    setDaysBeforeTecno(sub.days_before_tecno);
    setSoatHour(sub.soat_notify_hour);
    setTecnoHour(sub.tecno_notify_hour);
    setPicoHour(sub.pico_notify_hour);
    setEmail(sub.notification_email || "");
    setWhatsapp(sub.notification_whatsapp || "");
    setSoatDate(sub.soat_expires_at ?? "");
    setTecnoDate(sub.tecno_expires_at ?? "");
    setCity(sub.city ?? "Cali");
  }

  async function fetchAndHydrate(plateToLoad: string, fromAutoLoad = false) {
    setLoading(true);
    setStatusMsg(null);
    try {
      const rs = await fetch(`${API}/reminders/${plateToLoad}`);
      if (rs.status === 404) {
        setStatusMsg({ type: 'info', text: "No encontramos datos previos. Configura tus alertas abajo." });
        setSoatDate(""); setTecnoDate("");
        return;
      }
      if (!rs.ok) throw new Error();
      const json: ReminderSubscription = await rs.json();
      hydrateFrom(json);
      setStatusMsg({ type: 'success', text: fromAutoLoad ? "Datos cargados automáticamente." : "Configuración encontrada y cargada." });
    } catch {
      setStatusMsg({ type: 'error', text: "Error consultando la placa." });
    } finally {
      setLoading(false);
    }
  }

  async function handleLoad() {
    if (!plateFormatValid) return;
    await fetchAndHydrate(plate, false);
  }

  useEffect(() => {
    if (!initialPlate) return;
    const normalized = initialPlate.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (!normalized) return;
    setPlate(normalized);
    if (autoLoadOnMount && PLATE_RE.test(normalized)) {
      fetchAndHydrate(normalized, true);
    }
  }, [initialPlate, autoLoadOnMount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plateFormatValid) return setStatusMsg({ type: 'error', text: "Placa inválida (Ej: ABC123)" });
    
    setLoading(true);
    setStatusMsg(null);
    
    try {
      const body = {
        plate,
        notify_soat: notifySoat,
        notify_tecno: notifyTecno,
        notify_pico: notifyPico,
        days_before_soat: daysBeforeSoat,
        days_before_tecno: daysBeforeTecno,
        soat_notify_hour: soatHour,
        tecno_notify_hour: tecnoHour,
        pico_notify_hour: picoHour,
        notification_email: email.trim() || null,
        notification_whatsapp: whatsapp.trim() || null,
        soat_expires_at: soatDate || null,
        tecno_expires_at: tecnoDate || null,
        city: city.trim() || null,
      };

      const rs = await fetch(`${API}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!rs.ok) throw new Error();
      setStatusMsg({ type: 'success', text: "¡Alertas guardadas correctamente! ✅" });
    } catch {
      setStatusMsg({ type: 'error', text: "Error guardando. Intenta nuevamente." });
    } finally {
      setLoading(false);
    }
  }

  // Clases reutilizables
  const cardBase = "bg-[#161f32]/50 border border-white/5 rounded-2xl p-4 flex flex-col gap-3 transition-all hover:border-white/10";
  const inputBase = "w-full bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-slate-600";
  const labelBase = "text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 block";

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-6 shadow-2xl">
        
        {/* HEADER */}
        <div className="mb-8 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
            <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-400">
              <Bell className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Centro de Alertas</h3>
          </div>
          <p className="text-sm text-slate-400 max-w-2xl">
            Evita multas y olvidos. Configura tus notificaciones gratuitas para SOAT, Tecnomecánica y Pico y Placa.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* SECCIÓN 1: BUSCADOR DE PLACA (Main Input) */}
          <div className="relative max-w-md">
            <label className={labelBase}>Placa del Vehículo</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Car className="h-5 w-5 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
              </div>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="ABC123"
                maxLength={6}
                className={`w-full bg-[#161f32] border rounded-xl py-4 pl-10 pr-32 text-lg font-mono font-bold tracking-widest text-white outline-none focus:ring-2 transition-all ${!plateFormatValid && plate.length > 0 ? 'border-red-500/50 focus:ring-red-500/20' : 'border-slate-700 focus:border-emerald-500/50 focus:ring-emerald-500/20'}`}
              />
              <button
                type="button"
                onClick={handleLoad}
                disabled={!plateFormatValid || loading}
                className="absolute right-2 top-2 bottom-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-white/5"
              >
                <Search className="w-3 h-3" />
                Buscar
              </button>
            </div>
            {!plateFormatValid && plate.length > 0 && (
              <p className="text-[10px] text-red-400 mt-1 pl-1">Formato inválido (Ej: ABC123)</p>
            )}
          </div>

          {/* SECCIÓN 2: GRID DE SERVICIOS (Cards) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* CARD SOAT */}
            <div className={`${cardBase} ${notifySoat ? 'bg-emerald-500/5 border-emerald-500/20' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-white">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  SOAT
                </div>
                <input type="checkbox" checked={notifySoat} onChange={e => setNotifySoat(e.target.checked)} className="accent-emerald-500 h-5 w-5 cursor-pointer rounded bg-slate-800 border-slate-600" />
              </div>
              
              {notifySoat && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className={labelBase}>Vencimiento</label>
                    <div className="relative">
                       <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                       <input type="date" value={soatDate} onChange={e => setSoatDate(e.target.value)} className={`${inputBase} pl-9`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelBase}>Avisar antes</label>
                      <div className="relative">
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500">días</span>
                        <input type="number" min={1} max={60} value={daysBeforeSoat} onChange={e => setDaysBeforeSoat(Number(e.target.value))} className={inputBase} />
                      </div>
                    </div>
                    <div>
                      <label className={labelBase}>Hora</label>
                      <select value={soatHour} onChange={e => setSoatHour(Number(e.target.value))} className={inputBase}>
                        {HOUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CARD TECNO */}
            <div className={`${cardBase} ${notifyTecno ? 'bg-emerald-500/5 border-emerald-500/20' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-white">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Tecnomecánica
                </div>
                <input type="checkbox" checked={notifyTecno} onChange={e => setNotifyTecno(e.target.checked)} className="accent-emerald-500 h-5 w-5 cursor-pointer" />
              </div>

              {notifyTecno && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className={labelBase}>Vencimiento</label>
                    <div className="relative">
                       <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                       <input type="date" value={tecnoDate} onChange={e => setTecnoDate(e.target.value)} className={`${inputBase} pl-9`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelBase}>Avisar antes</label>
                      <div className="relative">
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500">días</span>
                        <input type="number" min={1} max={60} value={daysBeforeTecno} onChange={e => setDaysBeforeTecno(Number(e.target.value))} className={inputBase} />
                      </div>
                    </div>
                    <div>
                      <label className={labelBase}>Hora</label>
                      <select value={tecnoHour} onChange={e => setTecnoHour(Number(e.target.value))} className={inputBase}>
                        {HOUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CARD PICO Y PLACA */}
            <div className={`${cardBase} ${notifyPico ? 'bg-emerald-500/5 border-emerald-500/20' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-white">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  Pico y Placa
                </div>
                <input type="checkbox" checked={notifyPico} onChange={e => setNotifyPico(e.target.checked)} className="accent-emerald-500 h-5 w-5 cursor-pointer" />
              </div>

              {notifyPico && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className={labelBase}>Ciudad</label>
                    <div className="relative">
                       <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                       <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Ej: Cali" className={`${inputBase} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelBase}>Hora de aviso</label>
                    <div className="relative">
                       <Clock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                       <select value={picoHour} onChange={e => setPicoHour(Number(e.target.value))} className={`${inputBase} pl-9`}>
                          {HOUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                       </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* SECCIÓN 3: CONTACTO Y GUARDAR */}
          <div className="bg-[#161f32] border border-slate-700 rounded-2xl p-6">
            <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400" />
              Canales de Notificación
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className={labelBase}>Correo Electrónico</label>
                <div className="relative">
                   <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                   <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className={`${inputBase} pl-9`} />
                </div>
              </div>
              <div>
                <label className={labelBase}>WhatsApp (Opcional)</label>
                <div className="relative">
                   <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                   <input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value.replace(/[^\d]/g, ""))} placeholder="3001234567" className={`${inputBase} pl-9`} />
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-700">
              <div className="text-sm">
                {statusMsg && (
                   <div className={`flex items-center gap-2 ${statusMsg.type === 'success' ? 'text-emerald-400' : statusMsg.type === 'error' ? 'text-red-400' : 'text-blue-400'}`}>
                     {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
                     {statusMsg.text}
                   </div>
                )}
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? "Guardando..." : "Guardar Configuración"}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}