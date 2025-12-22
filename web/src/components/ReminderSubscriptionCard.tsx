import { useEffect, useState } from "react";

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
  // nuevos campos
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
    const [plate, setPlate] = useState(() =>
    (initialPlate || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6)
  );
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

  // nuevos estados: fechas de vencimiento + ciudad
  const [soatDate, setSoatDate] = useState("");
  const [tecnoDate, setTecnoDate] = useState("");
  const [city, setCity] = useState("");

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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

    // hidratar fechas y ciudad (si vienen)
    setSoatDate(sub.soat_expires_at ?? "");
    setTecnoDate(sub.tecno_expires_at ?? "");
    setCity(sub.city ?? "");
  }

  async function fetchAndHydrate(plateToLoad: string, fromAutoLoad = false) {
    setLoading(true);
    if (!fromAutoLoad) {
      setStatusMsg(null);
    }
    try {
      const rs = await fetch(`${API}/reminders/${plateToLoad}`);
      if (rs.status === 404) {
        setStatusMsg(
          "No encontramos recordatorios para esta placa. Puedes crearlos y guardarlos a continuación."
        );
        // limpiar campos (por si venías de otra placa)
        setSoatDate("");
        setTecnoDate("");
        setCity("");
        return;
      }
      if (!rs.ok) throw new Error(await rs.text());
      const json: ReminderSubscription = await rs.json();
      hydrateFrom(json);
      setStatusMsg(
        fromAutoLoad
          ? "Cargamos tus recordatorios desde el enlace. Puedes ajustarlos o desactivarlos y guardar los cambios."
          : "Configuración cargada. Puedes ajustar y guardar los cambios."
      );
    } catch {
      setStatusMsg("Error consultando la placa. Inténtalo de nuevo más tarde.");
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

    const normalized = initialPlate
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);

    if (!normalized) return;

    setPlate(normalized);

    if (autoLoadOnMount && PLATE_RE.test(normalized)) {
      fetchAndHydrate(normalized, true);
    }
  }, [initialPlate, autoLoadOnMount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plateFormatValid) {
      setStatusMsg("Ingresa una placa válida en formato ABC123.");
      return;
    }
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

      if (!rs.ok) throw new Error(await rs.text());
      setStatusMsg("Recordatorios guardados correctamente ✅");
    } catch {
      setStatusMsg("Error guardando los recordatorios. Inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-10 rounded-3xl border border-white/10 bg-slate-900/80 p-5 text-left md:p-6">
      <h3 className="text-base font-semibold text-white sm:text-lg">
        Recordatorios de SOAT, Tecnomecánico y Pico y Placa
      </h3>
      <p className="mt-1 text-xs text-slate-300">
        Registra tu placa para recibir recordatorios automáticos antes del
        vencimiento de tu SOAT, tecnomecánico y pico y placa. Te avisaremos por
        correo electrónico y/o WhatsApp (si lo indicas) para que puedas
        programarte con tiempo y evites comparendos o sorpresas de última hora.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs sm:text-sm">
        {/* Placa + botón Buscar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Placa
            </label>
            <input
              value={plate}
              onChange={(e) =>
                setPlate(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                )
              }
              placeholder="ABC123"
              maxLength={6}
              inputMode="text"
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {!plateFormatValid && plate.length > 0 && (
              <p className="mt-1 text-[11px] text-red-400">
                Formato válido: tres letras y tres números (ej: ABC123).
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleLoad}
              disabled={!plateFormatValid || loading}
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-50 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-800"
              title={
                plateFormatValid
                  ? "Busca si ya tienes recordatorios guardados para esta placa y carga la configuración para editarla."
                  : "Ingresa primero una placa válida (ABC123) para poder buscar."
              }
            >
              Buscar placa
              <span
                className="ml-2 text-[11px] text-slate-400"
                aria-hidden="true"
              >
                ⓘ
              </span>
            </button>
            <p className="text-[11px] text-slate-500 max-w-xs">
              Si ya habías configurado recordatorios para esta placa, usa{" "}
              <span className="font-semibold">“Buscar placa”</span> para
              cargarlos y actualizar los datos.
            </p>
          </div>
        </div>

        {/* Fechas de vencimiento + ciudad */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Vencimiento SOAT (opcional)
            </label>
            <input
              type="date"
              value={soatDate}
              onChange={(e) => setSoatDate(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Vencimiento Tecnomecánico (opcional)
            </label>
            <input
              type="date"
              value={tecnoDate}
              onChange={(e) => setTecnoDate(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Ciudad (opcional)
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ej: Cali"
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>

        {/* Flags SOAT / Tecno / Pico */}
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-500 bg-slate-950"
              checked={notifySoat}
              onChange={(e) => setNotifySoat(e.target.checked)}
            />
            SOAT
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-500 bg-slate-950"
              checked={notifyTecno}
              onChange={(e) => setNotifyTecno(e.target.checked)}
            />
            Tecnomecánico
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-500 bg-slate-950"
              checked={notifyPico}
              onChange={(e) => setNotifyPico(e.target.checked)}
            />
            Pico y placa
          </label>
        </div>

        {/* Días antes */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Días antes para SOAT
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={daysBeforeSoat}
              onChange={(e) => setDaysBeforeSoat(Number(e.target.value) || 1)}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Días antes para Tecnomecánico
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={daysBeforeTecno}
              onChange={(e) => setDaysBeforeTecno(Number(e.target.value) || 1)}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>

        {/* Horas */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Hora SOAT
            </label>
            <select
              value={soatHour}
              onChange={(e) => setSoatHour(Number(e.target.value))}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {HOUR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Hora Tecno
            </label>
            <select
              value={tecnoHour}
              onChange={(e) => setTecnoHour(Number(e.target.value))}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {HOUR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Hora Pico y Placa
            </label>
            <select
              value={picoHour}
              onChange={(e) => setPicoHour(Number(e.target.value))}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {HOUR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Contacto opcional */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              Email para notificaciones (opcional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@example.com"
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-200">
              WhatsApp (opcional, solo números)
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) =>
                setWhatsapp(e.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="573001234567"
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>

        {/* Botón guardar */}
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-slate-950 shadow-lg shadow-white/20 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Guardando..." : "Guardar recordatorios"}
          </button>
        </div>

        {statusMsg && (
          <p className="mt-2 text-[11px] text-slate-300">{statusMsg}</p>
        )}
      </form>
    </div>
  );
}
