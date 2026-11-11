import { VehicleApplicationForm } from "../components/VehicleApplicationForm";

/**
 * /rent-your-car — Registro público de vehículos.
 * Desde el ticket #38 usa el mismo formulario que /#propietarios (captación única en `vehicle_applications`):
 * el propietario elige entre administración AllAtYou (alquiler), venta en catálogo o ambas.
 */
export default function RentYourCar() {
  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold text-emerald-300 mb-3">
            🚗 PROPIETARIOS ALLATYOU
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3 tracking-tight">Registra tu carro</h1>
          <p className="text-base text-slate-300 max-w-xl mx-auto">
            Nosotros lo administramos y lo ponemos a producir, o lo publicamos en nuestro catálogo de venta. Tú eliges.
          </p>
        </div>
        <VehicleApplicationForm />
      </div>
    </div>
  );
}
