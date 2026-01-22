import { NavLink, Outlet } from "react-router-dom";
import { clearBasicAuth } from "../lib/auth";

export default function AdminLayout() {
  const handleLogout = () => {
    if (confirm("¿Cerrar sesión del panel administrativo?")) {
      clearBasicAuth();
      window.location.href = "/"; // Forzamos recarga para limpiar memoria
    }
  };

  // Estilos para los items del menú
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-xl ${
      isActive
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    }`;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* SIDEBAR OSCURO */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 transition-all duration-300">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold tracking-tight text-white">
            AllAtYou <span className="text-emerald-500">Admin</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">Panel de Control</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {/* GRUPO: OPERACIÓN */}
          <div className="mb-6">
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Operación</p>
            
            {/* ACTIVOS PRINCIPALES */}
            <NavLink to="/admin/vehicles" className={navItemClass}>
              <span>🚗</span> Flota
            </NavLink>
            <NavLink to="/admin/drivers" className={navItemClass}>
              <span>🧢</span> Conductores
            </NavLink>

            {/* GESTIÓN */}
            <NavLink to="/admin/recruitment" className={navItemClass}>
              <span>👥</span> Reclutamiento
            </NavLink>
            <NavLink to="/admin/advances" className={navItemClass}>
              <span>💸</span> Anticipos
            </NavLink>
          </div>

          {/* GRUPO: FINANCIERO */}
          <div className="mb-6">
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Financiero</p>
            <NavLink to="/admin/profit" className={navItemClass}>
              <span>📈</span> Utilidad Mensual
            </NavLink>
          </div>

          {/* GRUPO: SISTEMA */}
          <div>
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Sistema</p>
            <NavLink to="/admin/reminders-log" className={navItemClass}>
              <span>🔔</span> Logs Recordatorios
            </NavLink>
          </div>
        </nav>

        {/* FOOTER SIDEBAR */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-950/30 hover:text-red-300 rounded-xl transition-colors"
          >
            <span>🚪</span> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO (Aquí se pintan las páginas) */}
      <main className="flex-1 overflow-y-auto bg-slate-50 scroll-smooth p-0">
        <Outlet />
      </main>
    </div>
  );
}