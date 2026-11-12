// Pantalla de ingreso al panel admin (Issue #49). Spec: docs/specs/usuarios-auth.md
// Google · correo+contraseña · recuperar contraseña · acceso genérico (temporal).
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, KeyRound, ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import GoogleButton from "../components/GoogleButton";
import {
  API_URL, type AuthConfig, type SessionUser, authPost, daysLabel, daysUntil, formatDateEs,
  getAuthConfig, getAuthMode, setLegacy, setSession, clearBasicAuth,
} from "../lib/auth";

type Mode = "login" | "forgot" | "legacy";

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") && params.get("next")!.startsWith("/") ? params.get("next")! : "/reports";

  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legacyUser, setLegacyUser] = useState("");
  const [legacyPass, setLegacyPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (getAuthMode()) navigate(next, { replace: true });
    getAuthConfig().then(setConfig);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (token: string, user: SessionUser) => {
    setSession(token, user);
    navigate(next, { replace: true });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); } catch (e) { setError((e as Error).message || "Ocurrió un error"); } finally { setBusy(false); }
  };

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await authPost<{ token: string; user: SessionUser }>("/login", { email, password });
      done(r.token, r.user);
    });
  };

  const onGoogle = (credential: string) =>
    run(async () => {
      const r = await authPost<{ token: string; user: SessionUser }>("/google", { credential });
      done(r.token, r.user);
    });

  const onForgot = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await authPost("/forgot", { email });
      setInfo("Si el correo tiene usuario, te llegará un enlace para crear una nueva contraseña. Revisa también spam.");
    });
  };

  const onLegacy = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const header = setLegacy(legacyUser, legacyPass);
      const res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: header } });
      if (!res.ok) {
        clearBasicAuth();
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Usuario o clave genérica incorrectos.");
      }
      // Abre el asistente guiado al entrar al panel
      sessionStorage.setItem("aay_onboarding_autoopen", "1");
      navigate(next, { replace: true });
    });
  };

  const legacyActive = config?.legacyActive ?? true;
  const legacyDays = config ? daysUntil(config.legacyUntil) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            AllAtYou <span className="text-emerald-400">Admin</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Panel de Control</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8">
          {mode === "login" && (
            <>
              <h2 className="text-lg font-bold text-slate-800 mb-1">Inicia sesión</h2>
              <p className="text-sm text-slate-500 mb-5">Con tu cuenta de Google o tu correo y contraseña.</p>

              <GoogleButton clientId={config?.googleClientId ?? null} onCredential={onGoogle} />

              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs text-slate-400">o con tu correo</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <form onSubmit={onLogin} className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-1"><Mail size={13} /> Correo</span>
                  <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-1"><Lock size={13} /> Contraseña</span>
                  <input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                <button disabled={busy} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 flex items-center justify-center gap-2">
                  {busy && <Loader2 size={16} className="animate-spin" />} Entrar
                </button>
              </form>

              <button onClick={() => { setMode("forgot"); setError(null); }} className="mt-3 w-full text-center text-sm text-emerald-700 hover:underline">
                ¿Olvidaste tu contraseña?
              </button>
            </>
          )}

          {mode === "forgot" && (
            <>
              <button onClick={() => { setMode("login"); setInfo(null); }} className="text-sm text-slate-500 flex items-center gap-1 mb-3 hover:text-slate-800">
                <ArrowLeft size={14} /> Volver
              </button>
              <h2 className="text-lg font-bold text-slate-800 mb-1">Recuperar contraseña</h2>
              <p className="text-sm text-slate-500 mb-5">Te enviaremos un enlace a tu correo para crear una nueva. Vence en 60 minutos.</p>
              <form onSubmit={onForgot} className="space-y-3">
                <input className={inputClass} type="email" placeholder="tu@correo.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <button disabled={busy} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 flex items-center justify-center gap-2">
                  {busy && <Loader2 size={16} className="animate-spin" />} Enviar enlace
                </button>
              </form>
            </>
          )}

          {mode === "legacy" && (
            <>
              <button onClick={() => setMode("login")} className="text-sm text-slate-500 flex items-center gap-1 mb-3 hover:text-slate-800">
                <ArrowLeft size={14} /> Volver
              </button>
              <h2 className="text-lg font-bold text-slate-800 mb-1">Acceso genérico</h2>
              <p className="text-sm text-slate-500 mb-4">
                Entra con el usuario compartido de siempre. Al entrar te guiamos para crear tu usuario personal (toma 1 minuto).
              </p>
              <form onSubmit={onLegacy} className="space-y-3">
                <input className={inputClass} placeholder="Usuario" autoComplete="username" required value={legacyUser} onChange={(e) => setLegacyUser(e.target.value)} />
                <input className={inputClass} type="password" placeholder="Clave" autoComplete="current-password" required value={legacyPass} onChange={(e) => setLegacyPass(e.target.value)} />
                <button disabled={busy} className="w-full rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-semibold py-2.5 flex items-center justify-center gap-2">
                  {busy && <Loader2 size={16} className="animate-spin" />} Entrar con acceso genérico
                </button>
              </form>
            </>
          )}

          {error && <p className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</p>}
          {info && <p className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3">{info}</p>}
        </div>

        {mode !== "legacy" && config && (
          <div className="mt-4 rounded-2xl bg-amber-50/95 border border-amber-200 p-4 text-sm text-amber-900">
            {legacyActive ? (
              <>
                <p className="flex items-start gap-2">
                  <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                  <span>
                    ¿Aún no tienes usuario? El usuario y contraseña genéricos funcionan hasta el{" "}
                    <b>{formatDateEs(config.legacyUntil)}</b>
                    {legacyDays !== null && ` (${daysLabel(legacyDays)})`}.
                  </span>
                </p>
                <button onClick={() => { setMode("legacy"); setError(null); }} className="mt-2 ml-6 font-semibold text-amber-900 underline flex items-center gap-1">
                  <KeyRound size={14} /> Entrar con el acceso genérico y crear mi usuario
                </button>
              </>
            ) : (
              <p>El acceso genérico ya fue retirado. Si no tienes usuario, pide a un administrador que te invite.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
