import { useState, useEffect, useRef } from "react";
import { Car, TrendingUp, Users, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const GOAL = 20_000_000;

function formatCOP(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

interface PledgeTotals {
  total: number;
  count: number;
}

interface FormState {
  name: string;
  document_id: string;
  phone: string;
  email: string;
  nequi_account: string;
  amount: string;
  accepted_terms: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  document_id: "",
  phone: "",
  email: "",
  nequi_account: "",
  amount: "",
  accepted_terms: false,
};

export function InvestmentVaki() {
  const [totals, setTotals] = useState<PledgeTotals>({ total: 0, count: 0 });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carRef = useRef<HTMLDivElement>(null);

  // ── Fetch totals on mount ──────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/pledges`)
      .then((r) => r.json())
      .then((d) => setTotals({ total: d.total ?? 0, count: d.count ?? 0 }))
      .catch(() => {/* silently ignore; bar stays at 0 */});
  }, [success]); // re-fetch after a successful submission

  // ── Progress calculation ───────────────────────────────────────────────────
  const pct = Math.min((totals.total / GOAL) * 100, 100);
  const goalReached = totals.total >= GOAL;

  // ── Form helpers ───────────────────────────────────────────────────────────
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/pledges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount.replace(/\D/g, "")),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al registrar.");
      setSuccess(true);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="vaki" className="rounded-3xl border border-white/10 bg-[#0d1b2a] p-8 md:p-10 shadow-2xl backdrop-blur-sm">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-400 mb-4 uppercase tracking-wider">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          Fondeo Comunitario · Vaki AllAtYou
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">
          Ayúdanos a poner más carros{" "}
          <span className="text-amber-400">en la vía.</span>
        </h2>
        <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
          Queremos expandir la flota y necesitamos el apoyo de la comunidad. Registra tu intención de participar en el fondeo del próximo vehículo. Te contactaremos personalmente para explicarte todos los detalles.
        </p>
      </div>

      {/* ── Progress Bar ── */}
      <div className="mb-10">
        {/* Metas en texto */}
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Recaudado</p>
            <p className={`text-2xl font-extrabold ${goalReached ? "text-emerald-400" : "text-white"}`}>
              {formatCOP(totals.total)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Meta</p>
            <p className="text-2xl font-extrabold text-slate-300">{formatCOP(GOAL)}</p>
          </div>
        </div>

        {/* Barra con carro */}
        <div className="relative h-5 rounded-full bg-white/5 border border-white/10 overflow-visible mb-6">
          {/* Fill */}
          <div
            className={`h-full rounded-full transition-all duration-700 ${goalReached ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${pct}%` }}
          />
          {/* Car icon — floats above the bar tip */}
          <div
            ref={carRef}
            className="absolute -top-4 transition-all duration-700"
            style={{ left: `calc(${pct}% - 16px)` }}
          >
            <Car
              className={`w-7 h-7 drop-shadow-lg ${goalReached ? "text-emerald-400" : "text-amber-400"}`}
              strokeWidth={1.8}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <strong className="text-white">{totals.count}</strong> personas han expresado interés
          </span>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <strong className="text-white">{pct.toFixed(1)}%</strong> de la meta cubierto
          </span>
        </div>

        {goalReached && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm font-bold text-emerald-400">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            ¡Meta Cumplida! Estamos en proceso de fondeo. Gracias a todos los participantes.
          </div>
        )}
      </div>

      {/* ── Form ── */}
      {success ? (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-xl font-bold text-white mb-2">¡Registro exitoso!</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Recibimos tu expresión de interés. Nuestro equipo te contactará directamente al número o correo que registraste para contarte todos los detalles del fondeo.
          </p>
          <button
            onClick={() => setSuccess(false)}
            className="mt-6 text-xs text-amber-400 hover:underline"
          >
            Registrar otra persona
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nombre completo *</label>
            <input
              name="name" type="text" required value={form.name} onChange={handleChange}
              placeholder="Ej. Carlos Andrés Gómez"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.07] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Número de cédula *</label>
            <input
              name="document_id" type="text" required value={form.document_id} onChange={handleChange}
              placeholder="Ej. 1005234567"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.07] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Celular *</label>
            <input
              name="phone" type="tel" required value={form.phone} onChange={handleChange}
              placeholder="Ej. 3001234567"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.07] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Correo electrónico *</label>
            <input
              name="email" type="email" required value={form.email} onChange={handleChange}
              placeholder="Ej. carlos@email.com"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.07] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Número de cuenta Nequi *</label>
            <input
              name="nequi_account" type="text" required value={form.nequi_account} onChange={handleChange}
              placeholder="Ej. 3001234567"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.07] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Monto que deseas comprometer (COP) *
            </label>
            <input
              name="amount" type="number" required min="100000" step="50000"
              value={form.amount} onChange={handleChange}
              placeholder="Ej. 500000"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.07] transition-colors"
            />
            <p className="text-[10px] text-slate-500 mt-1">Mínimo $100.000 COP</p>
          </div>

          {/* Checkbox Habeas Data */}
          <div className="sm:col-span-2">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                name="accepted_terms" type="checkbox" required
                checked={form.accepted_terms} onChange={handleChange}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
              />
              <span className="text-[11px] text-slate-400 leading-relaxed">
                Autorizo a AllAtYou Renting S.A.S el tratamiento de mis datos personales conforme a la{" "}
                <span className="text-amber-400">Ley 1581 de 2012</span>, únicamente para gestionar esta expresión de interés de fondeo. *
              </span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="sm:col-span-2 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-bold px-6 py-4 transition-all hover:scale-[1.01] shadow-lg shadow-amber-900/20"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando…</>
                : "Registrar mi interés de participación"}
            </button>

            {/* Aviso legal */}
            <p className="mt-3 text-[10px] text-slate-500 text-center leading-relaxed">
              Esto es una <strong className="text-slate-400">expresión de interés</strong>, no un pago ni una oferta de valores. Al alcanzar la meta, AllAtYou te contactará para explicarte los términos del fondeo y concretar la transferencia. No implica retornos garantizados.
            </p>
          </div>
        </form>
      )}
    </section>
  );
}
