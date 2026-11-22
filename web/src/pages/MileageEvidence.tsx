// Página pública para el conductor: evidencia de kilometraje y gasolina (Issue #75).
// Se abre desde el link de WhatsApp /km/:token. El km debe ser mayor al anterior.
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Gauge, Fuel, Camera, CheckCircle2, AlertTriangle, Car } from "lucide-react";
import { compressImage } from "../utils/compressImage";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

const FUEL_OPTIONS = [
  { value: "empty", label: "Vacío", pct: "0%" },
  { value: "1/4", label: "1/4", pct: "25%" },
  { value: "1/2", label: "1/2", pct: "50%" },
  { value: "3/4", label: "3/4", pct: "75%" },
  { value: "full", label: "Lleno", pct: "100%" },
];

type Info = {
  plate: string;
  driver_name: string | null;
  status: "pending" | "completed" | "expired";
  previous_mileage_km: number | null;
  mileage_km: number | null;
  fuel_level: string | null;
  completed_at: string | null;
};

const fmt = (n: number) => n.toLocaleString("es-CO");

// Contenedor fuera del componente para no remontar los inputs en cada render
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex justify-center px-4 py-8">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export default function MileageEvidence() {
  const { token } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mileage, setMileage] = useState("");
  const [fuel, setFuel] = useState<string>("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/mileage-evidence/${token}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Link inválido");
        setInfo(d);
      })
      .catch((e) => setLoadError(e.message));
  }, [token]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const km = Number(mileage || 0);
  const prev = info?.previous_mileage_km ?? null;
  const kmTooLow = mileage !== "" && prev != null && km <= prev;

  const onPhoto = (f: File | undefined) => {
    if (!f) return;
    setPhoto(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    setError(null);
    if (!km) return setError("Digita el kilometraje que marca el tablero.");
    if (kmTooLow) return setError(`El kilometraje debe ser mayor al anterior (${fmt(prev!)} km).`);
    if (!fuel) return setError("Selecciona el nivel de gasolina.");
    if (!photo) return setError("Toma la foto del tablero como evidencia.");

    setSending(true);
    try {
      const compressed = await compressImage(photo, { maxWidth: 1400, maxHeight: 1400, quality: 0.75 });
      const fd = new FormData();
      fd.append("mileage_km", String(km));
      fd.append("fuel_level", fuel);
      fd.append("file", compressed);
      const r = await fetch(`${API}/public/mileage-evidence/${token}`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.previous_mileage_km != null && info) setInfo({ ...info, previous_mileage_km: d.previous_mileage_km });
        throw new Error(d.error || "No se pudo enviar la evidencia.");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la evidencia.");
    } finally {
      setSending(false);
    }
  };

  if (loadError) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl shadow p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-2" />
          <p className="font-bold text-slate-800">{loadError}</p>
          <p className="text-sm text-slate-500 mt-1">Pide un link nuevo a la oficina.</p>
        </div>
      </Shell>
    );
  }

  if (!info) return <Shell><p className="text-center text-slate-500">Cargando…</p></Shell>;

  if (done || info.status === "completed") {
    return (
      <Shell>
        <div className="bg-white rounded-2xl shadow p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
          <p className="font-bold text-slate-800 text-lg">¡Evidencia recibida!</p>
          <p className="text-sm text-slate-500 mt-1">
            {info.plate} · {fmt(done ? km : Number(info.mileage_km || 0))} km. Gracias.
          </p>
        </div>
      </Shell>
    );
  }

  if (info.status === "expired") {
    return (
      <Shell>
        <div className="bg-white rounded-2xl shadow p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
          <p className="font-bold text-slate-800">Este link venció</p>
          <p className="text-sm text-slate-500 mt-1">Pide un link nuevo a la oficina.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-2xl shadow p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600"><Car className="w-6 h-6" /></div>
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold">Reporte de kilometraje y gasolina</p>
            <p className="text-xl font-black text-slate-800">{info.plate}</p>
            {info.driver_name && <p className="text-sm text-slate-500">{info.driver_name}</p>}
          </div>
        </div>

        {/* KILOMETRAJE */}
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-1">
            <Gauge className="w-4 h-4 text-blue-600" /> Kilometraje del tablero
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Ej: 85432"
            value={mileage ? fmt(Number(mileage)) : ""}
            onChange={(e) => setMileage(e.target.value.replace(/\D/g, ""))}
            className={`w-full border rounded-xl px-4 py-3 text-2xl font-bold tracking-wide ${kmTooLow ? "border-rose-400 bg-rose-50" : "border-slate-300"}`}
          />
          {prev != null && (
            <p className={`text-xs mt-1 ${kmTooLow ? "text-rose-600 font-bold" : "text-slate-500"}`}>
              Debe ser mayor al anterior: {fmt(prev)} km
            </p>
          )}
        </div>

        {/* GASOLINA */}
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
            <Fuel className="w-4 h-4 text-amber-600" /> Nivel de gasolina
          </label>
          <div className="grid grid-cols-5 gap-2">
            {FUEL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setFuel(o.value)}
                className={`rounded-xl border py-3 text-sm font-bold ${fuel === o.value ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-slate-300 text-slate-700"}`}
              >
                {o.label}
                <span className="block text-[10px] font-normal opacity-80">{o.pct}</span>
              </button>
            ))}
          </div>
        </div>

        {/* FOTO */}
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
            <Camera className="w-4 h-4 text-slate-600" /> Foto del tablero (km y gasolina)
          </label>
          <label className="block border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-50">
            {preview ? (
              <img src={preview} alt="Evidencia" className="max-h-64 mx-auto rounded-lg" />
            ) : (
              <span className="text-sm text-slate-500">Toca para tomar la foto</span>
            )}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          <p className="text-[11px] text-slate-400 mt-1">Que se vean claramente el kilometraje y la aguja de gasolina.</p>
        </div>

        {error && <p className="text-sm text-rose-600 font-bold bg-rose-50 rounded-lg p-3">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={sending}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl py-4 text-lg"
        >
          {sending ? "Enviando…" : "Enviar evidencia"}
        </button>
      </div>
    </Shell>
  );
}
