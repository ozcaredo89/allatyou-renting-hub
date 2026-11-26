import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { DriverApplicationForm } from "../components/DriverApplicationForm";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export default function EditDriverApplication() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [application, setApplication] = useState<any | null>(null);
  const [editable, setEditable] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Enlace inválido.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/driver-applications/by-token/${token}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || data?.error || "No encontramos tu postulación.");
        }
        if (!cancelled) {
          setApplication(data.application);
          setEditable(Boolean(data.editable));
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Error cargando la postulación.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">AllAtYou Renting</p>
            <h1 className="text-2xl font-bold text-white mt-1">Revisar o corregir postulación</h1>
          </div>
          <Link
            to="/"
            className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5"
          >
            Ir al inicio
          </Link>
        </div>

        {loading && (
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center text-sm text-slate-300">
            Cargando tu postulación...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-red-500/30 bg-slate-900/80 p-8 text-center space-y-3">
            <h2 className="text-lg font-bold text-red-400">No pudimos abrir este enlace</h2>
            <p className="text-sm text-slate-300">{error}</p>
          </div>
        )}

        {!loading && !error && application && !editable && (
          <div className="rounded-3xl border border-amber-500/30 bg-slate-900/80 p-8 text-center space-y-3">
            <h2 className="text-lg font-bold text-amber-300">Postulación ya procesada</h2>
            <p className="text-sm text-slate-300">
              Tu postulación se encuentra en estado{" "}
              <span className="font-bold text-white uppercase">{application.status}</span> y ya no puede editarse desde este enlace.
            </p>
            <p className="text-xs text-slate-400">
              Si necesitas actualizar algún dato, comunícate con nuestro equipo de reclutamiento.
            </p>
          </div>
        )}

        {!loading && !error && application && editable && token && (
          <DriverApplicationForm editToken={token} initialData={application} />
        )}
      </div>
    </div>
  );
}
