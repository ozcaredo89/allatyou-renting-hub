import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";

// Layouts (Los Marcos Visuales)
import AdminLayout from "./components/AdminLayout";
import PublicLayout from "./components/PublicLayout";

// Páginas Públicas / Operativas
import Landing from "./pages/Landing";
import Pay from "./pages/Pay";
import Reports from "./pages/Reports";
import Expenses from "./pages/Expenses";

// Páginas Administrativas
import AdminAdvances from "./pages/AdminAdvances";
import AdminProfit from "./pages/AdminProfit";
import RemindersLog from "./pages/RemindersLog";
import AdminRecruitment from "./pages/AdminRecruitment";
import AdminVehicles from "./pages/AdminVehicles"; // <--- 1. IMPORTAR

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
            No tiene sidebar.
           ======================================================= */}
        <Route element={<PublicLayout />}>
          {/* Ruta Raíz: 
              - Si es operativo (web.), redirige directo a pagar.
              - Si es comercial (www.), muestra la Landing. 
          */}
          <Route
            path="/"
            element={
              isWebSubdomain ? <Navigate to="/pay" replace /> : <Landing />
            }
          />
          
          <Route path="/pay" element={<Pay />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/expenses" element={<Expenses />} />
        </Route>

        {/* =======================================================
            MUNDO 2: ADMINISTRATIVO
            Usa AdminLayout (Sidebar Oscuro).
            Las páginas internas validan sus credenciales (Basic Auth).
           ======================================================= */}
        <Route path="/admin" element={<AdminLayout />}>
          {/* Rutas hijas relativas a /admin/ */}
          <Route path="advances" element={<AdminAdvances />} />
          <Route path="profit" element={<AdminProfit />} />
          <Route path="reminders-log" element={<RemindersLog />} />
          <Route path="recruitment" element={<AdminRecruitment />} />
          <Route path="vehicles" element={<AdminVehicles />} /> {/* <--- 2. AGREGAR RUTA */}

          {/* Redirección por defecto: /admin -> /admin/recruitment */}
          <Route index element={<Navigate to="recruitment" replace />} />
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
