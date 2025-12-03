// web/src/pages/Landing.tsx
const WHATSAPP_URL =
  "https://wa.me/573113738912?text=Hola%20AllAtYou%2C%20quiero%20informaci%C3%B3n%20sobre%20el%20renting%20de%20veh%C3%ADculos."; 

export default function Landing() {
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
            <a
              href="#servicios"
              className="text-slate-300 hover:text-white"
            >
              Servicios
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
            <a
              href="/pay"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-semibold text-slate-50 hover:bg-white/10"
            >
              Ingresar a la app de pagos
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
                href="mailto:contacto@allatyou.com" --MATRIXMAIL25
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
