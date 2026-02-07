import { NavLink, Outlet } from "react-router-dom";

export default function PublicLayout() {
  const link = "px-3 py-2 rounded-lg text-sm font-medium transition-colors";
  const active = "bg-black text-white";
  const inactive = "text-gray-700 hover:bg-gray-100";

  const hostname = window.location.hostname;
  const isPublicDomain = hostname === "www.allatyou.com" || hostname === "allatyou.com";
  
  // REGLA DE NEGOCIO:
  // Si estamos en la landing pública (www), ocultamos el acceso a /pay
  // para evitar curiosos. En web.allatyou.com (operativo) sí se muestra.
  const showPagosLink = !isPublicDomain;

  return (
    <div className="min-h-screen flex flex-col font-sans text-gray-900">
      {/* HEADER BLANCO */}
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            AllAtYou
          </div>
          
          <nav className="flex gap-2 items-center">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `${link} ${isActive ? active : inactive}`}
            >
              Inicio
            </NavLink>

            {/* CATÁLOGO (DEMANDA) */}
            <NavLink
              to="/rent"
              className={({ isActive }) => `${link} ${isActive ? active : inactive}`}
            >
              Rentar un Carro 🚗
            </NavLink>

            {/* MERCADO (OFERTA) */}
            <NavLink
              to="/rent-your-car"
              className={({ isActive }) => 
                `${link} ${isActive ? active : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'}`
              }
            >
              Sube tu Carro 💸
            </NavLink>

            <NavLink
              to="/assistance"
              className={({ isActive }) => `${link} ${isActive ? active : inactive}`}
            >
              Asistencia
            </NavLink>

            {showPagosLink && (
              <NavLink
                to="/pay"
                className={({ isActive }) => `${link} ${isActive ? active : inactive}`}
              >
                Pagos
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      {/* CONTENIDO PÚBLICO (Landing, Pay, Assistance, RentYourCar, etc.) */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}