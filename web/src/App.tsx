import { BrowserRouter, Link, Route, Routes, NavLink } from "react-router-dom";
import Pay from "./pages/Pay";
import Reports from "./pages/Reports";

export default function App() {
  const link = "px-3 py-2 rounded-lg text-sm font-medium";
  const active = "bg-black text-white";
  const inactive = "text-gray-700 hover:bg-gray-100";

  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
            <div className="font-bold">AllAtYou</div>
            <nav className="flex gap-2">
              <NavLink to="/pay" className={({isActive}) => `${link} ${isActive ? active : inactive}`}>Pagos</NavLink>
              <NavLink to="/reports" className={({isActive}) => `${link} ${isActive ? active : inactive}`}>Reportes</NavLink>
            </nav>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Pay />} />
            <Route path="/pay" element={<Pay />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="*" element={<div className="p-6 mx-auto max-w-5xl">404</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
