import { useState } from "react";

export function IncomeSimulator() {
  const [vehicles, setVehicles] = useState(1);
  const [dailyRent, setDailyRent] = useState(55000); // Base solicitada
  const [daysPerWeek, setDaysPerWeek] = useState(6);

  // Cálculo: (Diario * DíasSemana * 4.34 semanas promedio) * Vehículos
  const monthlyIncome = dailyRent * daysPerWeek * 4.34 * vehicles;

  function formatMoney(amount: number) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0e1730] p-6 shadow-2xl shadow-emerald-500/10">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Simulador de Rentabilidad</h2>
          <p className="text-xs text-slate-400">Proyección basada en modelo estándar</p>
        </div>
        <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
          Demo
        </span>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">Vehículos</label>
            <select
              value={vehicles}
              onChange={(e) => setVehicles(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "Carro" : "Carros"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">Días trabajados/sem</label>
            <select
              value={daysPerWeek}
              onChange={(e) => setDaysPerWeek(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="6">6 Días (Lunes-Sábado)</option>
              <option value="7">7 Días (Full time)</option>
              <option value="5">5 Días (Lunes-Viernes)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-slate-400">
            Entrega Diaria Estimada (Conductor)
          </label>
          <input
            type="number"
            value={dailyRent}
            onChange={(e) => setDailyRent(Number(e.target.value))}
            step={1000}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none font-mono"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            * Promedio base sugerido: $55.000 libre de gasolina.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
          <p className="mb-1 text-xs text-emerald-200">Ingreso Mensual Bruto Estimado</p>
          <p className="text-2xl font-bold text-white tracking-tight">
            {formatMoney(monthlyIncome)}
          </p>
          <p className="mt-2 text-[10px] text-emerald-200/60 leading-tight">
            *Cifra antes de gastos de mantenimiento y comisión de administración (50% sobre utilidad).
          </p>
        </div>

        <button className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-500 transition-all hover:-translate-y-0.5">
          Quiero esta rentabilidad
        </button>
      </div>
    </div>
  );
}