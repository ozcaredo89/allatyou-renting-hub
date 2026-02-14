import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";

// Layouts
import AdminLayout from "./components/AdminLayout";
import PublicLayout from "./components/PublicLayout";

// Páginas Públicas / Operativas
import Landing from "./pages/Landing";
import Pay from "./pages/Pay";
import Reports from "./pages/Reports";
import Expenses from "./pages/Expenses";
import Assistance from "./pages/Assistance";
import RentYourCar from "./pages/RentYourCar"; 
import RentCatalog from "./pages/RentCatalog";

// Páginas Administrativas
import AdminAdvances from "./pages/AdminAdvances";
import AdminDrivers from "./pages/AdminDrivers";
import AdminDeposits from "./pages/AdminDeposits";
import AdminCollections from "./pages/AdminCollections";
import AdminVehicles from "./pages/AdminVehicles";
import AdminProfit from "./pages/AdminProfit";
import AdminRecruitment from "./pages/AdminRecruitment";
import RemindersLog from "./pages/RemindersLog";
import AdminMarketplace from "./pages/AdminMarketplace"; 

// Inspecciones
import NewInspection from "./pages/NewInspection";
import AdminInspections from "./pages/AdminInspections";

export default function App() {
  const hostname = window.location.hostname;
  
  // 1. DETECCIÓN DE ENTORNO
  // Si es el subdominio 'web' O estás en tu PC (localhost), mostramos la APP INTERNA.
  const isApp = hostname === "web.allatyou.com" || hostname.includes("localhost");

  return (
    <BrowserRouter>
      <Routes>
        
        {/* =======================================================
            ESCENARIO 1: APP INTERNA (ERP / Admin)
            Dominio: web.allatyou.com ó localhost:5173
           ======================================================= */}
        {isApp ? (
          <>
            {/* --- A. Rutas Operativas "Sueltas" (Sin Sidebar) --- */}
            <Route element={<PublicLayout />}>
              {/* La home interna redirige a Pagos (Operativo rápido) */}
              <Route path="/" element={<Navigate to="/pay" replace />} />
              <Route path="/pay" element={<Pay />} />
              <Route path="/assistance" element={<Assistance />} />
            </Route>

            {/* --- B. Rutas Administrativas (CON Sidebar) --- */}
            {/* Aquí vive toda la gestión. Sin prefijo /admin porque YA estamos en la app admin */}
            <Route element={<AdminLayout />}>
              
              {/* FINANZAS */}
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/advances" element={<AdminAdvances />} />
              <Route path="/profit" element={<AdminProfit />} />
              <Route path="/deposits" element={<AdminDeposits />} />
              <Route path="/collections" element={<AdminCollections />} />

              {/* ACTIVOS */}
              <Route path="/vehicles" element={<AdminVehicles />} /> 
              <Route path="/drivers" element={<AdminDrivers />} />
              <Route path="/recruitment" element={<AdminRecruitment />} />
              
              {/* OPERACIONES */}
              <Route path="/reminders-log" element={<RemindersLog />} />
              <Route path="/inspections" element={<AdminInspections />} />
              <Route path="/inspections/new" element={<NewInspection />} />
              <Route path="/marketplace" element={<AdminMarketplace />} />

              {/* 404 Interno */}
              <Route path="*" element={<div className="p-10 text-center text-slate-500">Página no encontrada en Admin</div>} />
            </Route>
          </>
        ) : (
          /* =======================================================
             ESCENARIO 2: LANDING PAGE (Marketing)
             Dominio: www.allatyou.com
             ======================================================= */
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/rent-your-car" element={<RentYourCar />} />
            <Route path="/rent" element={<RentCatalog />} />
            
            {/* Permitimos /pay también en la landing por comodidad de conductores */}
            <Route path="/pay" element={<Pay />} /> 
            
            {/* Cualquier otra cosa en la landing va al home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}

      </Routes>
    </BrowserRouter>
  );
}