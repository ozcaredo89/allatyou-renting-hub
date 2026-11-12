// Crear/recuperar contraseña desde el enlace del correo (Issue #49).
// Sirve para "olvidé mi contraseña" y para invitaciones (mismo token de un solo uso).
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2 } from "lucide-react";
import { type SessionUser, authPost, setSession } from "../lib/auth";
import { inputClass } from "./Login";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setBusy(true); setError(null);
    try {
      const r = await authPost<{ token: string; user: SessionUser }>("/reset", { token, password });
      setSession(r.token, r.user);
      setOk(true);
      setTimeout(() => navigate("/reports", { replace: true }), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8">
        <h1 className="text-lg font-bold text-slate-800 mb-1">Crea tu nueva contraseña</h1>
        <p className="text-sm text-slate-500 mb-5">Mínimo 8 caracteres. Al guardarla entrarás directo al panel.</p>

        {!token ? (
          <p className="text-sm text-red-600">El enlace está incompleto. <Link to="/login" className="underline">Pide uno nuevo</Link>.</p>
        ) : ok ? (
          <p className="flex items-center gap-2 text-emerald-700 font-semibold"><CheckCircle2 size={18} /> ¡Listo! Entrando…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input className={inputClass} type="password" autoComplete="new-password" placeholder="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <input className={inputClass} type="password" autoComplete="new-password" placeholder="Repite la contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <button disabled={busy} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 flex items-center justify-center gap-2">
              {busy && <Loader2 size={16} className="animate-spin" />} Guardar y entrar
            </button>
            {error && (
              <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-3">
                {error} <Link to="/login" className="underline font-semibold">Ir al inicio</Link>
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
