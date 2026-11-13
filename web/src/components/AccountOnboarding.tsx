// Migración guiada a usuarios personales (Issue #49). Spec: docs/specs/usuarios-auth.md
// - LegacyBanner: aviso fijo mientras se usa el acceso genérico (fecha de retiro + días).
// - OnboardingWizard "self": crea MI usuario (Google o correo+contraseña) paso a paso.
// - OnboardingWizard "invite": un usuario personal da acceso a otra persona por correo.
// - AccountFooter: usuario actual + invitar, en el pie del sidebar.
import { useEffect, useState } from "react";
import {
  X, ShieldCheck, Sparkles, Mail, Lock, User, Loader2, CheckCircle2, ArrowRight, ArrowLeft, UserPlus, KeyRound, LogIn,
} from "lucide-react";
import GoogleButton from "./GoogleButton";
import {
  type AuthConfig, type SessionUser, authPost, daysLabel, daysUntil, formatDateEs, getAuthConfig, getLegacyHeader, getSessionToken, setSession,
} from "../lib/auth";

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";
const primaryBtn =
  "rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold px-4 py-2.5 flex items-center justify-center gap-2";

function useAuthConfig(): AuthConfig | null {
  const [c, setC] = useState<AuthConfig | null>(null);
  useEffect(() => { getAuthConfig().then(setC); }, []);
  return c;
}

// ------------------------------------------------------------------
// Banner
// ------------------------------------------------------------------

export function LegacyBanner({ onStart }: { onStart: () => void }) {
  const config = useAuthConfig();
  if (!config) return null;
  const days = daysUntil(config.legacyUntil);
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-amber-900 shrink-0">
      <span className="flex items-center gap-2">
        <ShieldCheck size={18} className="shrink-0 text-amber-600" />
        <span>
          Estás usando el <b>usuario y contraseña genéricos</b>, que se retiran el <b>{formatDateEs(config.legacyUntil)}</b>
          {" "}({daysLabel(days)}). Crea tu usuario personal: toma 1 minuto.
        </span>
      </span>
      <button onClick={onStart} className="ml-auto rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold px-3 py-1.5 flex items-center gap-1.5">
        <Sparkles size={15} /> Crear mi usuario
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Asistente
// ------------------------------------------------------------------

type Step = "intro" | "method" | "email" | "done";

function Progress({ step }: { step: Step }) {
  const order: Step[] = ["intro", "method", "done"];
  const idx = step === "email" ? 1 : order.indexOf(step);
  return (
    <div className="flex gap-1.5 mb-5">
      {order.map((_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-emerald-500" : "bg-slate-200"}`} />
      ))}
    </div>
  );
}

function Bullet({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="block text-sm text-slate-500">{text}</span>
      </span>
    </li>
  );
}

export function OnboardingWizard({
  kind,
  onClose,
  onSession,
}: {
  kind: "self" | "invite";
  onClose: () => void;
  onSession: (user: SessionUser) => void;
}) {
  const config = useAuthConfig();
  const [step, setStep] = useState<Step>(kind === "self" ? "intro" : "email");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ user: SessionUser; via: "google" | "password" | "invite"; invited?: boolean } | null>(null);

  // El asistente "self" se autentica con el acceso genérico vigente; "invite" con la sesión.
  const authHeader = kind === "self" ? getLegacyHeader() || undefined : `Bearer ${getSessionToken()}`;

  const finishSelf = (token: string, user: SessionUser, via: "google" | "password") => {
    setSession(token, user);
    onSession(user);
    setCreated({ user, via });
    setStep("done");
  };

  const onGoogle = async (credential: string) => {
    setBusy(true); setError(null);
    try {
      const r = await authPost<{ token: string; user: SessionUser }>("/google", { credential }, authHeader);
      finishSelf(r.token, r.user, "google");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const onSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (kind === "self") {
      if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
      if (password !== confirm) return setError("Las contraseñas no coinciden.");
    }
    setBusy(true);
    try {
      if (kind === "self") {
        const r = await authPost<{ token: string; user: SessionUser }>("/register", { full_name: fullName, email, password }, authHeader);
        finishSelf(r.token, r.user, "password");
      } else {
        const r = await authPost<{ user: SessionUser; invited: boolean }>("/register", { full_name: fullName, email }, authHeader);
        setCreated({ user: r.user, via: "invite", invited: r.invited });
        setStep("done");
      }
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-7 relative max-h-[95vh] overflow-y-auto">
        <button onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"><X size={20} /></button>

        {kind === "self" && <Progress step={step} />}

        {/* PASO 1 — Por qué */}
        {step === "intro" && (
          <>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">Paso 1 de 3</p>
            <h2 className="text-xl font-bold text-slate-800 mb-1">Vamos a crear tu usuario personal</h2>
            <p className="text-sm text-slate-500 mb-5">
              Todo lo demás sigue igual: mismas pantallas, mismos datos. Solo cambia cómo entras.
            </p>
            <ul className="space-y-4 mb-5">
              <Bullet icon={<LogIn size={18} />} title="Entra con tu Gmail" text="Un clic con tu cuenta de Google, sin recordar claves." />
              <Bullet icon={<KeyRound size={18} />} title="Recupera tu contraseña tú mismo" text="Si la olvidas, te llega un enlace a tu correo." />
              <Bullet icon={<ShieldCheck size={18} />} title="Tu sesión queda guardada 30 días" text="No te volverá a pedir clave en cada pestaña." />
            </ul>
            {config && (
              <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 mb-5">
                El usuario y contraseña genéricos dejarán de funcionar el <b>{formatDateEs(config.legacyUntil)}</b>.
              </p>
            )}
            <div className="flex justify-between items-center">
              <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Recordarme después</button>
              <button onClick={() => setStep("method")} className={primaryBtn}>Empezar <ArrowRight size={16} /></button>
            </div>
          </>
        )}

        {/* PASO 2 — Elegir método */}
        {step === "method" && (
          <>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">Paso 2 de 3</p>
            <h2 className="text-xl font-bold text-slate-800 mb-1">¿Cómo quieres entrar?</h2>
            <p className="text-sm text-slate-500 mb-5">Elige una opción. Podrás usar la otra más adelante con el mismo correo.</p>

            <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/50 p-4 mb-3">
              <p className="text-sm font-semibold text-slate-800 mb-0.5">Con Google <span className="ml-1 text-[10px] font-bold uppercase bg-emerald-600 text-white rounded-full px-2 py-0.5">Recomendado</span></p>
              <p className="text-xs text-slate-500 mb-3">Usa tu Gmail. Es lo más rápido y no hay clave que olvidar.</p>
              {busy ? <p className="text-sm text-slate-500 flex items-center gap-2 justify-center"><Loader2 size={16} className="animate-spin" /> Creando tu usuario…</p>
                : <GoogleButton clientId={config?.googleClientId ?? null} onCredential={onGoogle} text="signup_with" />}
            </div>

            <button onClick={() => { setStep("email"); setError(null); }} className="w-full rounded-2xl border border-slate-200 hover:border-slate-300 p-4 text-left flex items-center gap-3">
              <span className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><Mail size={18} /></span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-slate-800">Con correo y contraseña</span>
                <span className="block text-xs text-slate-500">Cualquier correo. Tú eliges la contraseña.</span>
              </span>
              <ArrowRight size={16} className="text-slate-400" />
            </button>

            {error && <p className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</p>}
            <button onClick={() => setStep("intro")} className="mt-4 text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800"><ArrowLeft size={14} /> Atrás</button>
          </>
        )}

        {/* PASO 2b — Correo (self) / Invitación */}
        {step === "email" && (
          <>
            {kind === "self" ? (
              <>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">Paso 2 de 3</p>
                <h2 className="text-xl font-bold text-slate-800 mb-4">Tus datos</h2>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2"><UserPlus size={20} /> Dar acceso a alguien</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Le llegará un correo para crear su contraseña. También podrá entrar con Google si el correo es de Gmail.
                </p>
              </>
            )}
            <form onSubmit={onSubmitEmail} className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-1"><User size={13} /> Nombre completo</span>
                <input className={input} required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej: Ana Gómez" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-1"><Mail size={13} /> Correo</span>
                <input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@gmail.com" />
              </label>
              {kind === "self" && (
                <>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-1"><Lock size={13} /> Contraseña (mín. 8 caracteres)</span>
                    <input className={input} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-1"><Lock size={13} /> Repite la contraseña</span>
                    <input className={input} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </label>
                </>
              )}
              {error && <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</p>}
              <div className="flex justify-between items-center pt-1">
                {kind === "self"
                  ? <button type="button" onClick={() => setStep("method")} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800"><ArrowLeft size={14} /> Atrás</button>
                  : <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Cancelar</button>}
                <button disabled={busy} className={primaryBtn}>
                  {busy && <Loader2 size={16} className="animate-spin" />} {kind === "self" ? "Crear mi usuario" : "Enviar invitación"}
                </button>
              </div>
            </form>
          </>
        )}

        {/* PASO 3 — Listo */}
        {step === "done" && created && (
          <>
            {kind === "self" && <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">Paso 3 de 3</p>}
            <div className="flex flex-col items-center text-center mb-5">
              <CheckCircle2 size={48} className="text-emerald-500 mb-2" />
              <h2 className="text-xl font-bold text-slate-800">
                {kind === "self" ? `¡Listo, ${created.user.full_name.split(" ")[0]}!` : "Usuario creado"}
              </h2>
              <p className="text-sm text-slate-500">
                {kind === "self"
                  ? "Ya estás usando tu usuario personal en este navegador."
                  : created.invited
                    ? `Le enviamos a ${created.user.email} un correo para crear su contraseña (vence en 72 horas).`
                    : `No pudimos enviar el correo. Dile a ${created.user.full_name} que entre con Google usando ${created.user.email}, o que use "¿Olvidaste tu contraseña?".`}
              </p>
            </div>
            {kind === "self" && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-5">
                <p className="text-sm font-semibold text-slate-800 mb-2">La próxima vez que entres:</p>
                <ol className="text-sm text-slate-600 space-y-1.5 list-decimal list-inside">
                  {created.via === "google" ? (
                    <li>Pulsa <b>“Continuar con Google”</b> y elige <b>{created.user.email}</b>.</li>
                  ) : (
                    <li>Escribe <b>{created.user.email}</b> y tu contraseña.</li>
                  )}
                  <li>¿Olvidaste la contraseña? Usa <b>“¿Olvidaste tu contraseña?”</b> y te llega un enlace.</li>
                  <li>Para darle acceso a un compañero usa <b>“Invitar usuario”</b> en el menú lateral.</li>
                </ol>
              </div>
            )}
            <button onClick={onClose} className={`${primaryBtn} w-full`}>Ir al panel</button>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Pie del sidebar
// ------------------------------------------------------------------

export function AccountFooter({
  user, collapsed, onInvite, onCreate,
}: {
  user: SessionUser | null; collapsed: boolean; onInvite: () => void; onCreate: () => void;
}) {
  if (!user) {
    return (
      <button onClick={onCreate} title="Crear mi usuario"
        className={`flex w-full items-center gap-3 py-2.5 px-4 text-sm font-medium text-amber-300 hover:bg-amber-900/20 rounded-xl ${collapsed ? "md:justify-center md:px-2" : ""}`}>
        <Sparkles size={16} className="shrink-0" /><span className={collapsed ? "md:hidden" : ""}>Crear mi usuario</span>
      </button>
    );
  }
  const initials = user.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-3 py-2 px-4 ${collapsed ? "md:justify-center md:px-2" : ""}`} title={`${user.full_name} · ${user.email}`}>
        {user.avatar_url
          ? <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full shrink-0" />
          : <span className="h-7 w-7 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{initials}</span>}
        <span className={`min-w-0 ${collapsed ? "md:hidden" : ""}`}>
          <span className="block text-sm text-white truncate">{user.full_name}</span>
          <span className="block text-[11px] text-slate-500 truncate">{user.email}</span>
        </span>
      </div>
      <button onClick={onInvite} title="Invitar usuario"
        className={`flex w-full items-center gap-3 py-2 px-4 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white rounded-xl ${collapsed ? "md:justify-center md:px-2" : ""}`}>
        <UserPlus size={16} className="shrink-0" /><span className={collapsed ? "md:hidden" : ""}>Invitar usuario</span>
      </button>
    </div>
  );
}
