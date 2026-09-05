import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { clearBasicAuth } from "../lib/auth";

const SIDEBAR_STORAGE_KEY = "admin_sidebar_collapsed";

function getInitialCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) return stored === "true";
  } catch { /* ignorar */ }
  // Default: colapsado si el viewport es menor a 1440px (laptops/tablets)
  return typeof window !== "undefined" && window.innerWidth < 1440;
}

export default function AdminLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(getInitialCollapsed);
  const location = useLocation();

  // Cerrar el menú automáticamente cuando cambiamos de página (UX móvil)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  // Persistir preferencia de colapso en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isCollapsed));
    } catch { /* ignorar */ }
  }, [isCollapsed]);

  // Atajo Ctrl+B / Cmd+B — ignorar si el foco está en un campo de texto
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.isContentEditable
        ) return;
        e.preventDefault();
        setIsCollapsed((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = () => {
    if (confirm("¿Cerrar sesión del panel administrativo?")) {
      clearBasicAuth();
      window.location.href = "/";
    }
  };

  // Estilos para los items del menú
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 py-2.5 text-sm font-medium transition-colors rounded-xl
    ${isCollapsed ? "justify-center px-2" : "px-4"}
    ${isActive
      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
      : "text-slate-400 hover:bg-slate-800 hover:text-white"
    }`;

  // Componente NavItem con aria-label y tooltip en modo colapsado
  const NavItem = ({
    to, icon, label, end,
  }: { to: string; icon: string; label: string; end?: boolean }) => (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      title={label}
      className={navItemClass}
    >
      <span className="text-base shrink-0" aria-hidden="true">{icon}</span>
      {!isCollapsed && <span className="truncate leading-tight">{label}</span>}
    </NavLink>
  );

  const SectionLabel = ({ text, colorClass = "text-slate-500" }: { text: string; colorClass?: string }) =>
    isCollapsed
      ? <div className="mx-2 my-2 border-t border-slate-700/40" />
      : <p className={`px-4 text-[10px] font-bold ${colorClass} uppercase tracking-wider mb-1.5`}>{text}</p>;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* 1. BACKDROP - Solo visible en móvil cuando el menú está abierto */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 2. SIDEBAR */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-slate-900 text-white flex flex-col shrink-0
          transition-all duration-300 ease-in-out shadow-2xl
          md:relative md:shadow-none md:translate-x-0
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
          ${isCollapsed ? "w-[72px]" : "w-64"}
        `}
      >
        {/* Cabecera */}
        <div className={`border-b border-slate-800 flex items-center shrink-0
          ${isCollapsed ? "p-3 justify-center" : "p-4 justify-between"}`}>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <h2 className="text-xl font-bold tracking-tight text-white leading-tight">
                AllAtYou <span className="text-emerald-500">Admin</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Panel de Control</p>
            </div>
          )}
          <div className="flex items-center gap-1">
            {/* Cerrar — solo móvil */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Cerrar menú de navegación"
            >
              <X className="w-5 h-5" />
            </button>
            {/* Toggle colapsar/expandir — solo desktop */}
            <button
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              aria-label={isCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
              title={isCollapsed ? "Expandir (Ctrl+B)" : "Colapsar (Ctrl+B)"}
            >
              {isCollapsed
                ? <ChevronRight className="w-4 h-4" />
                : <ChevronLeft className="w-4 h-4" />
              }
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto overflow-x-hidden scrollbar-hide">

          {/* OPERACIÓN */}
          <div className="mb-3">
            <SectionLabel text="Operación" />
            <NavItem to="/vehicles" icon="🚗" label="Flota" />
            <NavItem to="/inventory" icon="📦" label="Inventario" />
            <NavItem to="/drivers" icon="🧢" label="Conductores" />
            <NavItem to="/recruitment" icon="👥" label="Reclutamiento" />
            <NavItem to="/advances" icon="💸" label="Anticipos" />
            <NavItem to="/collections" icon="📲" label="Gestión Cobros" />
            <NavItem to="/marketplace" icon="🏪" label="Marketplace" />
            <NavItem to="/trips" icon="🚕" label="Rutas" />

            {/* AUDITORÍA */}
            <div className="mt-2 pt-2 border-t border-slate-800/50">
              <SectionLabel text="Auditoría & Control" colorClass="text-emerald-600" />
              <NavItem to="/audits" icon="🛡️" label="Monitoreo Gastos" />
              <NavItem to="/oracle" icon="🔮" label="Oráculo DaaS" />
              <NavItem to="/inspections/new" icon="📷" label="Nueva Inspección" />
              <NavItem to="/inspections" icon="📋" label="Historial Insp." end />
            </div>
          </div>

          {/* FINANCIERO */}
          <div className="mb-3">
            <SectionLabel text="Financiero" />
            <NavItem to="/expenses" icon="🧾" label="Gastos Operativos" />
            <NavItem to="/deposits" icon="💰" label="Depósitos" />
            <NavItem to="/profit" icon="📈" label="Utilidad Mensual" />
            <NavItem to="/amortization" icon="🔢" label="Simulador Amort." />
            <NavItem to="/reports" icon="📑" label="Reportes" />
          </div>

          {/* SISTEMA */}
          <div>
            <SectionLabel text="Sistema" />
            <NavItem to="/reminders-log" icon="🔔" label="Logs Recordatorios" />
          </div>
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-slate-800 shrink-0">
          <button
            onClick={handleLogout}
            aria-label="Cerrar Sesión"
            title="Cerrar Sesión"
            className={`flex w-full items-center gap-3 py-2.5 text-sm font-medium text-red-400 hover:bg-red-950/30 hover:text-red-300 rounded-xl transition-colors
              ${isCollapsed ? "justify-center px-2" : "px-4"}`}
          >
            <span aria-hidden="true">🚪</span>
            {!isCollapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* 3. CONTENEDOR PRINCIPAL */}
      <div className="flex-1 flex flex-col h-full overflow-hidden w-full min-w-0">

        {/* HEADER MÓVIL */}
        <header className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1 hover:bg-slate-800 rounded-lg"
              aria-label="Abrir menú de navegación"
            >
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