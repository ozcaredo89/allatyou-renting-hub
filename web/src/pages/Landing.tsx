import { useState } from "react";
import type { FormEvent } from "react";
import picoPlacaImg from "../assets/pico-placa.png"; // 👈 vas a crear este archivo

const WHATSAPP_URL =
  "https://wa.me/573113738912?text=Hola%20AllAtYou%2C%20quiero%20informaci%C3%B3n%20sobre%20el%20renting%20de%20veh%C3%ADculos.";

// Ajusta estos textos según el pico y placa real de tu ciudad
const PICO_PLACA_RULES: Record<number, string> = {
  0: "Ejemplo: Lunes (mañana y tarde) para placas terminadas en 0.",
  1: "Ejemplo: Lunes para placas terminadas en 1.",
  2: "Ejemplo: Martes para placas terminadas en 2.",
  3: "Ejemplo: Martes para placas terminadas en 3.",
  4: "Ejemplo: Miércoles para placas terminadas en 4.",
  5: "Ejemplo: Miércoles para placas terminadas en 5.",
  6: "Ejemplo: Jueves para placas terminadas en 6.",
  7: "Ejemplo: Jueves para placas terminadas en 7.",
  8: "Ejemplo: Viernes para placas terminadas en 8.",
  9: "Ejemplo: Viernes para placas terminadas en 9.",
};

export default function Landing() {
  const [plateQuery, setPlateQuery] = useState("");
  const [picoPlacaResult, setPicoPlacaResult] = useState<string | null>(null);

  function handleCheckPicoPlaca(e: FormEvent) {
    e.preventDefault();
    const clean = plateQuery.replace(/\s+/g, "").toUpperCase();

    if (!clean) {
      setPicoPlacaResult("Ingresa una placa válida (ej: ABC123).");
      return;
    }

    const match = clean.match(/(\d)$/);
    if (!match) {
      setPicoPlacaResult(
        "No encontramos un número al final de la placa. Verifica el formato (ej: ABC123)."
      );
      return;
    }

    const lastDigit = Number(match[1]);
    const rule = PICO_PLACA_RULES[lastDigit];

    if (!rule) {
      setPicoPlacaResult(
        `Para placas terminadas en ${lastDigit}, revisa el cuadro de pico y placa.`
      );
      return;
    }

    setPicoPlacaResult(`Para placas terminadas en ${lastDigit}: ${rule}`);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="border-b border-white/10 bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-slate-950">
              AY
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">
                AllAtYou Renting
              </span>
              <span className="text-xs text-slate-400">
                Tu carro, sin complicarte la vida
              </span>
            </div>
          </div>

          <div className="hidden gap-3 text-xs md:flex">
            <a href="#servicios" className="text-slate-300 hover:text-white">
              Servicios
            </a>
            <a href="#pico-placa" className="text-slate-300 hover:text-white">
              Pico y placa
            </a>
            <a href="#por-que" className="text-slate-300 hover:text-white">
              ¿Por qué AllAtYou?
            </a>
            <a href="#contacto" className="text-slate-300 hover:text-white">
              Contacto
            </a>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-12 pt-10 md:flex-row md:items-center">
        <div className="flex-1">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Renting y administración de vehículos para trabajo
          </p>
          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Tu carro trabajando por ti,
            <span className="block text-emerald-400">
              con números claros todos los días.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300">
            AllAtYou Renting S.A.S se encarga de la operación diaria: pagos
            de los conductores, gastos, anticipos y reportes de utilidad por
            placa. Tú ves todo en limpio y decides con tranquilidad.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
            >
              Quiero un carro en renting
            </a>
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400">
            <li>✔ Pagos diarios controlados</li>
            <li>✔ Gastos y anticipos centralizados</li>
            <li>✔ Profit mensual por placa</li>
          </ul>
        </div>

        <div className="flex-1">
          <div className="mx-auto max-w-sm rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-emerald-500/10">
            <div className="mb-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>Resumen ejemplo</span>
              <span>AllAtYou Hub</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-2">
                <span className="text-slate-300">Vehículos activos</span>
                <span className="font-semibold text-emerald-400">13</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-2">
                <span className="text-slate-300">Pagos recibidos hoy</span>
                <span className="font-semibold text-emerald-400">$XXX.XXX</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-2">
                <span className="text-slate-300">Vehículos en mora</span>
                <span className="font-semibold text-amber-300">N</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              La app interna muestra pagos, gastos, anticipos y utilidad por
              vehículo en tiempo casi real.
            </p>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section
        id="servicios"
        className="border-t border-white/5 bg-slate-950 py-10"
      >
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-xl font-semibold text-white sm:text-2xl">
            ¿Qué hacemos en AllAtYou?
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-300">
            Acompañamos tanto a conductores como a dueños de vehículo para que
            el carro sea un activo y no un problema.
          </p>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4 text-left">
              <p className="text-sm font-semibold text-white">
                Renting para conductores
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Esquemas claros de pago diario, soporte y acompañamiento para
                que puedas trabajar tranquilo con tu vehículo.
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4 text-left">
              <p className="text-sm font-semibold text-white">
                Administración para dueños
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Centralizamos pagos, gastos, anticipos, inversión, recuperación
                y utilidad mensual por placa.
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4 text-left">
              <p className="text-sm font-semibold text-white">
                Reportes y control de mora
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Último pago por vehículo, días de mora y reportes descargables
                en CSV para revisar la operación.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pico y Placa + Asistencias */}
      <section
        id="pico-placa"
        className="border-t border-white/5 bg-slate-950 py-10"
      >
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-xl font-semibold text-white sm:text-2xl">
            Pico y placa y asistencias para tu carro
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-300">
            Te ayudamos a recordar cuándo tienes pico y placa, cuándo se vence
            tu tecnomecánico, y te acompañamos con asistencia para tu vehículo
            en el día a día.
          </p>

          <div className="mt-7 grid gap-6 md:grid-cols-2">
            {/* Cuadro de consulta por placa */}
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/80 p-4 text-left">
              <p className="text-sm font-semibold text-white">
                Consulta rápida por placa
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Escribe la placa de tu vehículo y te mostramos el día que aplica
                pico y placa según el número final. Ajusta las reglas según tu ciudad.
              </p>

              <form onSubmit={handleCheckPicoPlaca} className="mt-4 space-y-3">
                <input
                value={plateQuery}
                onChange={(e) =>
                    setPlateQuery(
                    e.target.value
                        .toUpperCase()           // siempre en mayúsculas
                        .replace(/[^A-Z0-9]/g, "") // solo letras y números
                    )
                }
                placeholder="Ejemplo: ABC123"
                maxLength={6}
                inputMode="text"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Consultar pico y placa
                </button>
              </form>

              {picoPlacaResult && (
                <div className="mt-3 rounded-xl bg-slate-950/70 px-3 py-2 text-xs text-slate-200">
                  {picoPlacaResult}
                </div>
              )}

              <ul className="mt-4 space-y-1 text-xs text-slate-400">
                <li>• Recordatorios de pico y placa para tu vehículo.</li>
                <li>• Recordatorios de tecnomecánico y otros vencimientos.</li>
                <li>• Acompañamiento operativo para mantener tu carro al día.</li>
              </ul>
            </div>

            {/* Imagen con el cuadro oficial de pico y placa */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
              <p className="text-sm font-semibold text-white">
                Calendario de pico y placa
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Usamos el cuadro oficial de pico y placa para ayudarte a planear
                mejor tus turnos y tus recorridos.
              </p>
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-950">
                <img
                  src={picoPlacaImg}
                  alt="Calendario de pico y placa"
                  className="w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Por qué */}
      <section
        id="por-que"
        className="border-t border-white/5 bg-slate-950 py-10"
      >
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-xl font-semibold text-white sm:text-2xl">
            ¿Por qué AllAtYou?
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4 text-left">
              <p className="text-[11px] font-semibold text-emerald-300">
                Transparencia
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Todo se registra: pagos, gastos, anticipos y ajustes contables.
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4 text-left">
              <p className="text-[11px] font-semibold text-emerald-300">
                App propia
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Plataforma hecha a la medida de la operación diaria.
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4 text-left">
              <p className="text-[11px] font-semibold text-emerald-300">
                Soporte humano
              </p>
              <p className="mt-2 text-xs text-slate-300">
                No eres un número. Hablamos, ajustamos y buscamos que gane
                todo el mundo.
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4 text-left">
              <p className="text-[11px] font-semibold text-emerald-300">
                Enfoque en rentabilidad
              </p>
              <p className="mt-2 text-xs text-slate-300">
                La meta es clara: que la flota sea rentable y medible por
                vehículo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section
        id="contacto"
        className="border-t border-white/5 bg-slate-950 py-10"
      >
        <div className="mx-auto max-w-5xl px-4">
          <div className="rounded-3xl border border-emerald-500/30 bg-slate-900/80 p-6 text-left md:p-8">
            <h2 className="text-lg font-semibold text-white sm:text-xl">
              Hablemos de tu carro y de tus números
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Si quieres poner tu vehículo a producir, o necesitas un carro
              para trabajar, podemos revisar el esquema que más te sirva.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
              >
                Escribir por WhatsApp
              </a>
              <a
                href="mailto:contacto@allatyou.com"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-semibold text-slate-50 hover:bg-white/10"
              >
                Enviar correo
              </a>
            </div>
            <p className="mt-4 text-[11px] text-slate-400">
              AllAtYou Renting S.A.S — NIT 901.995.593 — Cali, Colombia.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
