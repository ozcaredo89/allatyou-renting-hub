import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { clearBasicAuth } from "../lib/auth";

export default function AdminLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Cerrar el menú automáticamente cuando cambiamos de página (UX móvil)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  const handleLogout = () => {
    if (confirm("¿Cerrar sesión del panel administrativo?")) {
      clearBasicAuth();
      window.location.href = "/";
    }
  };

  // Estilos para los items del menú
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-xl ${isActive
      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
      : "text-slate-400 hover:bg-slate-800 hover:text-white"
    }`;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* 1. BACKDROP (Fondo oscuro) - Solo visible en móvil cuando el menú está abierto */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 2. SIDEBAR RESPONSIVO */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col shrink-0 transition-transform duration-300 ease-in-out shadow-2xl
          md:relative md:translate-x-0 md:shadow-none
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              AllAtYou <span className="text-emerald-500">Admin</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">Panel de Control</p>
          </div>

          {/* Botón cerrar solo visible en móvil */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {/* GRUPO: OPERACIÓN */}
          <div className="mb-6">
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Operación</p>

            {/* NOTA: Quitamos '/admin' de todos los to="..." */}
            <NavLink to="/vehicles" className={navItemClass}>
              <span>🚗</span> Flota
            </NavLink>
            <NavLink to="/drivers" className={navItemClass}>
              <span>🧢</span> Conductores
            </NavLink>
            <NavLink to="/recruitment" className={navItemClass}>
              <span>👥</span> Reclutamiento
            </NavLink>
            <NavLink to="/advances" className={navItemClass}>
              <span>💸</span> Anticipos
            </NavLink>
            <NavLink to="/collections" className={navItemClass}>
              <span>📲</span> Gestión Cobros
            </NavLink>
            <NavLink to="/marketplace" className={navItemClass}>
              <span>🏪</span> Marketplace
            </NavLink>

            {/* --- SECCIÓN AUDITORÍA --- */}
            <div className="mt-4 pt-4 border-t border-slate-800/50">
              <p className="px-4 text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2">Auditoría & Control</p>
              <NavLink to="/audits" className={navItemClass}>
                <span>🛡️</span> Monitoreo Gastos
              </NavLink>
              <NavLink to="/inspections/new" className={navItemClass}>
                <span>📷</span> Nueva Inspección
              </NavLink>
              <NavLink to="/inspections" end className={navItemClass}>
                <span>📋</span> Historial Insp.
              </NavLink>
            </div>
          </div>

          {/* GRUPO: FINANCIERO */}
          <div className="mb-6">
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Financiero</p>

            {/* --- AQUÍ ESTÁ EL NUEVO ENLACE DE GASTOS --- */}
            <NavLink to="/expenses" className={navItemClass}>
              <span>🧾</span> Gastos Operativos
            </NavLink>
            {/* ------------------------------------------- */}

            <NavLink to="/deposits" className={navItemClass}>
              <span>💰</span> Depósitos
            </NavLink>
            <NavLink to="/profit" className={navItemClass}>
              <span>📈</span> Utilidad Mensual
            </NavLink>
            <NavLink to="/reports" className={navItemClass}>
              <span>📑</span> Reportes
            </NavLink>
          </div>

          {/* GRUPO: SISTEMA */}
          <div>
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Sistema</p>
            <NavLink to="/reminders-log" className={navItemClass}>
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

      {/* 3. CONTENEDOR PRINCIPAL */}
      <div className="flex-1 flex flex-col h-full overflow-hidden w-full">

        {/* HEADER MÓVIL (Solo visible en pantallas pequeñas) */}
        <header className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-1 hover:bg-slate-800 rounded-lg">
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-bold text-sm tracking-wide">AllAtYou Admin</span>
          </div>
        </header>

        {/* CONTENIDO DE LA PÁGINA */}
        <main className="flex-1 overflow-y-auto bg-slate-50 scroll-smooth p-0 w-full relative">
          <Outlet />
        </main>
      </div>

    </div>
  );
}