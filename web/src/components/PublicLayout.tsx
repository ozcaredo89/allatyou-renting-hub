import { NavLink, Outlet, Link } from "react-router-dom";

export default function PublicLayout() {
  const link = "px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors";
  const active = "bg-slate-900 text-white shadow-xs";
  const inactive = "text-slate-700 hover:bg-slate-100";

  const hostname = window.location.hostname;
  const isPublicDomain = hostname === "www.allatyou.com" || hostname === "allatyou.com";
  
  // REGLA DE NEGOCIO:
  // Si estamos en la landing pública (www), ocultamos el acceso a /pay
  // para evitar curiosos. En web.allatyou.com (operativo) sí se muestra.
  const showPagosLink = !isPublicDomain;

  return (
    <div className="min-h-screen flex flex-col font-sans text-gray-900">
      {/* HEADER BLANCO */}
      <header className="border-b bg-white/95 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-black text-xl tracking-tight text-slate-950">
            AllAtYou <span className="text-emerald-600 text-xs font-bold uppercase tracking-widest px-1.5 py-0.5 bg-emerald-50 rounded">Hub</span>
          </Link>
          
          <nav className="flex gap-1.5 sm:gap-2 items-center">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `hidden sm:flex ${link} ${isActive ? active : inactive}`}
            >
              Inicio
            </NavLink>

            {/* CATÁLOGO (ALQUILER & VENTA) */}
            <NavLink
              to="/rent"
              className={({ isActive }) => `${link} ${isActive ? active : inactive}`}
            >
              Carros Listos 🚗
            </NavLink>

            {/* MERCADO (OFERTA) */}
            <NavLink
              to="/rent-your-car"
              className={({ isActive }) => 
                `${link} ${isActive ? active : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'}`
              }
            >
              Publicar Carro 💸
            </NavLink>

            <NavLink
              to="/assistance"
              className={({ isActive }) => `hidden md:flex ${link} ${isActive ? active : inactive}`}
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

      {/* CONTENIDO PÚBLICO (Landing, Pay, Assistance, RentYourCar, RentCatalog, etc.) */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
