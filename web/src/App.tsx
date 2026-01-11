import { BrowserRouter, Route, Routes, NavLink, Navigate } from "react-router-dom";
import AdminAdvances from "./pages/AdminAdvances";
import Pay from "./pages/Pay";
import Reports from "./pages/Reports";
import Expenses from "./pages/Expenses";
import AdminProfit from "./pages/AdminProfit";
import RemindersLog from "./pages/RemindersLog";
import AdminRecruitment from "./pages/AdminRecruitment"; // 1. Importamos la nueva página
import Landing from "./pages/Landing";

export default function App() {
  const link = "px-3 py-2 rounded-lg text-sm font-medium";
  const active = "bg-black text-white";
  const inactive = "text-gray-700 hover:bg-gray-100";

  const hostname = window.location.hostname;
  const isWebSubdomain = hostname === "web.allatyou.com";
  const isPublicDomain = hostname === "www.allatyou.com";

  // En el dominio comercial (www) NO mostramos el link de Pagos en el header
  const showPagosLink = !isPublicDomain;

  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
            <div className="font-bold">AllAtYou</div>
            <nav className="flex gap-2">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `${link} ${isActive ? active : inactive}`
                }
              >
                Inicio
              </NavLink>

              {showPagosLink && (
                <NavLink
                  to="/pay"
                  className={({ isActive }) =>
                    `${link} ${isActive ? active : inactive}`
                  }
                >
                  Pagos
                </NavLink>
              )}

              {/* Más adelante puedes reactivar estas rutas en el menú */}
              {/* <NavLink to="/reports"  className={({isActive}) => `${link} ${isActive ? active : inactive}`}>Reportes</NavLink> */}
              {/* <NavLink to="/expenses" className={({isActive}) => `${link} ${isActive ? active : inactive}`}>Gastos</NavLink> */}
            </nav>
          </div>
        </header>

        <main>
          <Routes>
            {/* En web.allatyou.com: "/" -> /pay.
                En los demás dominios (www, localhost, etc.): "/" -> Landing */}
            <Route
              path="/"
              element={
                isWebSubdomain ? (
                  <Navigate to="/pay" replace />
                ) : (
                  <Landing />
                )
              }
            />
            <Route path="/pay" element={<Pay />} />
            
            {/* Rutas Administrativas */}
            <Route path="/admin/advances" element={<AdminAdvances />} />
            <Route path="/admin/profit" element={<AdminProfit />} />
            <Route path="/admin/reminders-log" element={<RemindersLog />} />
            
            {/* 2. Agregamos la nueva ruta de Reclutamiento */}
            <Route path="/admin/recruitment" element={<AdminRecruitment />} />

            <Route path="/reports" element={<Reports />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route
              path="*"
              element={
                <div className="mx-auto max-w-5xl p-6 text-sm text-gray-800">
                  404 — Ruta no encontrada
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}