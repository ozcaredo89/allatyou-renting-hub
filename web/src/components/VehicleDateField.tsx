import { useRef } from "react";
import { Calendar, CheckCircle2, AlertTriangle, X } from "lucide-react";

interface VehicleDateFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  defaultMonthsAhead?: number;
}

// Calcula una fecha YYYY-MM-DD sumando N meses a hoy
export function getFutureDate(monthsAhead: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toISOString().split("T")[0];
}

// Calcula fin de año (o siguiente semestre si estamos a fin de año)
export function getEndOfYearDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  if (now.getMonth() >= 10) {
    // Si es noviembre o diciembre, sugerir junio del próximo año
    return `${year + 1}-06-30`;
  }
  return `${year}-12-31`;
}

export function VehicleDateField({
  label,
  value,
  onChange,
  defaultMonthsAhead = 6,
}: VehicleDateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openCalendar = () => {
    try {
      inputRef.current?.showPicker?.();
    } catch {
      inputRef.current?.focus();
    }
  };

  // Determinar si la fecha está vigente o vencida respecto a hoy
  const todayStr = new Date().toISOString().split("T")[0];
  const isExpired = value ? value < todayStr : false;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-slate-300 font-semibold flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-emerald-400" />
          <span>{label}</span>
        </label>
        {value ? (
          isExpired ? (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" /> Vencido
            </span>
          ) : (
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> Vigente
            </span>
          )
        ) : (
          <span className="text-[10px] text-slate-500">Opcional</span>
        )}
      </div>

      {/* Input de Fecha con trigger de Calendario */}
      <div
        onClick={openCalendar}
        className="group relative flex items-center rounded-xl border border-white/15 bg-slate-950 px-3 py-2 cursor-pointer transition-colors hover:border-emerald-500/50 hover:bg-slate-900/60"
      >
        <Calendar className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 mr-2 shrink-0 transition-colors" />

        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-transparent text-xs text-white outline-none cursor-pointer [color-scheme:dark]"
        />

        {value && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onChange("");
            }}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-1"
            title="Borrar fecha"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Chips rápidos de sugerencia */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <span className="text-[10px] text-slate-400 shrink-0">Sugerir:</span>
        <button
          type="button"
          onClick={() => onChange(getFutureDate(defaultMonthsAhead))}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors border ${
            value === getFutureDate(defaultMonthsAhead)
              ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold"
              : "bg-slate-900 border-white/10 text-slate-300 hover:border-white/25 hover:text-white"
          }`}
        >
          +6 meses
        </button>
        <button
          type="button"
          onClick={() => onChange(getEndOfYearDate())}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors border ${
            value === getEndOfYearDate()
              ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold"
              : "bg-slate-900 border-white/10 text-slate-300 hover:border-white/25 hover:text-white"
          }`}
        >
          Fin de año
        </button>
        <button
          type="button"
          onClick={() => onChange(getFutureDate(12))}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors border ${
            value === getFutureDate(12)
              ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold"
              : "bg-slate-900 border-white/10 text-slate-300 hover:border-white/25 hover:text-white"
          }`}
        >
          +1 año
        </button>
      </div>
    </div>
  );
}
