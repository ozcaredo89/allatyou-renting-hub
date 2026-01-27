import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";

// Layouts (Los Marcos Visuales)
import AdminLayout from "./components/AdminLayout";
import PublicLayout from "./components/PublicLayout";

// Páginas Públicas / Operativas
import Landing from "./pages/Landing";
import Pay from "./pages/Pay";
import Reports from "./pages/Reports"; // Se mantiene el import
import Expenses from "./pages/Expenses";
import Assistance from "./pages/Assistance"; // <--- NUEVO IMPORT

// Páginas Administrativas
import AdminAdvances from "./pages/AdminAdvances";
import AdminDrivers from "./pages/AdminDrivers";
import AdminCollections from "./pages/AdminCollections";
import AdminVehicles from "./pages/AdminVehicles";
import AdminProfit from "./pages/AdminProfit";
import AdminRecruitment from "./pages/AdminRecruitment";
import RemindersLog from "./pages/RemindersLog";

export default function App() {
  const hostname = window.location.hostname;
  // Detectamos si estamos en el subdominio operativo
  const isWebSubdomain = hostname === "web.allatyou.com";

  return (
    <BrowserRouter>
      <Routes>
        
        {/* =======================================================
            MUNDO 1: PÚBLICO / OPERATIVO
            Usa PublicLayout (Header Blanco).
           ======================================================= */}
        <Route element={<PublicLayout />}>
          {/* Ruta Raíz: 
              - Si es operativo (web.), redirige a pagar.
              - Si es comercial (www. o localhost), muestra la Landing. 
          */}
          <Route
            path="/"
            element={
              isWebSubdomain ? <Navigate to="/pay" replace /> : <Landing />
            }
          />
          
          <Route path="/pay" element={<Pay />} />
          <Route path="/expenses" element={<Expenses />} />
          
          {/* NUEVA RUTA DE ASISTENCIA */}
          <Route path="/assistance" element={<Assistance />} />
        </Route>

        {/* =======================================================
            MUNDO 2: ADMINISTRATIVO
            Usa AdminLayout (Sidebar Oscuro).
            Las páginas internas validan sus credenciales.
           ======================================================= */}
        <Route path="/admin" element={<AdminLayout />}>
          {/* GESTIÓN DE ACTIVOS (Lo principal) */}
          <Route path="vehicles" element={<AdminVehicles />} /> 
          <Route path="drivers" element={<AdminDrivers />} />

          {/* GESTIÓN DE TALENTO */}
          <Route path="recruitment" element={<AdminRecruitment />} />

          {/* FINANZAS Y UTILIDADES */}
          <Route path="advances" element={<AdminAdvances />} />
          <Route path="profit" element={<AdminProfit />} />
          
          {/* NUEVA UBICACIÓN DE REPORTES (Mora/Cobros) */}
          <Route path="reports" element={<Reports />} /> 

          {/* GESTIÓN DE COBRANZAS */}
          <Route path="collections" element={<AdminCollections />} />

          {/* RUTA DE LOG DE RECORDATORIOS */}
          <Route path="reminders-log" element={<RemindersLog />} />

          {/* Redirección por defecto */}
          <Route index element={<Navigate to="vehicles" replace />} />
        </Route>

        {/* =======================================================
            404 - RUTA NO ENCONTRADA
           ======================================================= */}
        <Route
          path="*"
          element={
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 text-center">
              <h1 className="text-4xl font-bold text-gray-900">404</h1>
              <p className="mt-2 text-gray-600">Lo sentimos, esta página no existe.</p>
              <a 
                href="/" 
                className="mt-6 rounded-xl bg-black px-6 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                Volver al Inicio
              </a>
            </div>
          }
        />

      </Routes>
    </BrowserRouter>
  );
}