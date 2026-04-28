import "dotenv/config";
import express, { Request, Response } from "express";
import cors, { CorsOptionsDelegate } from "cors";
import { basicAuth } from "./middleware/basicAuth";

import advancesRoutes from "./routes/advances";
import companiesRoutes from "./routes/companies";
import drivers from "./routes/drivers";
import emailTestRouter from "./routes/emailTest";
import whatsappTestRouter from "./routes/whatsappTest";
import expenses from "./routes/expenses";
import investmentsRoutes from "./routes/investments";
import ledgerRoutes from "./routes/ledger";
import metricsRouter from "./routes/metrics";
import noPayRoutes from "./routes/noPay";
import payments from "./routes/payments";
import uploads from "./routes/uploads";
import reports from "./routes/reports";
import profitRoutes from "./routes/profit";
import remindersRoutes from "./routes/reminders";
import vehiclesRoutes from "./routes/vehicles";
import collectionsRoutes from "./routes/collections";
import appUsersRoutes from "./routes/app-users";
import depositsRoutes from "./routes/deposits";

// --- MÓDULO MARKETING ---
import marketingRoutes from "./routes/marketing";

// --- MÓDULO INSPECCIONES ---
import inspectionsRoutes from "./routes/inspections";

// --- MÓDULO MARKETPLACE (TURO CRIOLLO) ---
import marketplaceRoutes from "./routes/marketplace";

// --- NUEVO: MÓDULO PROVEEDORES (CUENTAS DE COBRO) ---
import providersRoutes from "./routes/providers";

// --- NUEVO: MÓDULO AUDITORÍA DE GASTOS ---
import auditsRoutes from "./routes/audits";

// --- NUEVO: MÓDULO INVENTARIO Y TALLER ---
import inventoryRoutes from "./routes/inventory";

import oracleRoutes from "./routes/oracle";

// --- MÓDULO DAEMON PROTRACK KILÓMETROS ---
import { syncProtrackMileage } from "./oraculo/mileage-daemon";
import { syncGpsImeis } from "./oraculo/sync-imei";

const app = express();

/** CORS: WEB_ORIGIN (puede ser lista separada por comas) + localhost + *.vercel.app */
const corsOptions: CorsOptionsDelegate = (req, cb) => {
  const origin = (req.headers?.origin as string) || "";
  const envOrigins = (process.env.WEB_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowList = [
    ...envOrigins,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
  ];
  let allowed = false;
  try {
    const host = origin ? new URL(origin).host : "";
    allowed = allowList.includes(origin) || host.endsWith(".vercel.app");
  } catch { }

  cb(null, {
    origin: allowed,
    optionsSuccessStatus: 200,
    allowedHeaders: ["Content-Type", "Authorization"],
  });
};

app.use(cors(corsOptions));
app.use(express.json());

/** Logger simple */
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.path} origin=${req.headers.origin ?? "-"}`);
  next();
});

app.get("/", (_req: Request, res: Response) => {
  res.send("AllAtYou Renting API ✅");
});

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

/** Rutas públicas */
app.use("/drivers", drivers);
app.use("/uploads", uploads);
app.use("/payments", payments);
app.use("/internal", emailTestRouter);
app.use("/internal", whatsappTestRouter);
app.use("/expenses", expenses);
app.use("/investments", investmentsRoutes);
app.use("/metrics", metricsRouter);
app.use("/no-pay", noPayRoutes);
app.use("/reminders", remindersRoutes);

// --- RUTA DE MARKETING (PÚBLICA PARA LA LANDING) ---
app.use("/marketing", marketingRoutes);

// --- RUTA MARKETPLACE (PÚBLICA: CATÁLOGO Y UPLOAD) ---
app.use("/marketplace", marketplaceRoutes);

// --- RUTAS BAJO DEMANDA (SUBASTA) ---
import tripsRoutes from "./routes/trips";
app.use("/trips", tripsRoutes);

// --- RECLUTAMIENTO (CONDUCTORES Y VEHÍCULOS) ---
import driverApplicationsRoutes from "./routes/driverApplications";
import vehicleApplicationsRoutes from "./routes/vehicleApplications";
app.use("/driver-applications", driverApplicationsRoutes);
app.use("/vehicle-applications", vehicleApplicationsRoutes);

/** Rutas protegidas con Basic Auth (monta el middleware en la misma línea) */
app.use("/companies", basicAuth, companiesRoutes);
app.use("/providers", basicAuth, providersRoutes);
app.use("/reports", basicAuth, profitRoutes);
app.use("/reports", basicAuth, reports);
app.use("/ledger", basicAuth, ledgerRoutes);
app.use("/advances", basicAuth, advancesRoutes);
app.use("/vehicles", basicAuth, vehiclesRoutes);
app.use("/collections", basicAuth, collectionsRoutes);
app.use("/app-users", basicAuth, appUsersRoutes);
app.use("/deposits", basicAuth, depositsRoutes);
app.use("/inspections", basicAuth, inspectionsRoutes);
app.use("/audits", basicAuth, auditsRoutes);
app.use("/inventory", basicAuth, inventoryRoutes);
app.use("/oracle", basicAuth, oracleRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API up on http://localhost:${PORT}`);

  // Arrancar el Daemon de Kilometraje al inicio (con delay para no bloquear)
  setTimeout(() => {
    // 1. Intentar emparejar nuevos IMEIs con nuevos Vehículos
    syncGpsImeis().catch(err => console.error("Error inicial Sync IMEI:", err));

    // 2. Extraer el kilometraje de los IMEIs emparejados
    setTimeout(() => {
      syncProtrackMileage().catch(err => console.error("Error inicial Daemon Kilometraje:", err));
    }, 30000); // 30s después del emparejamiento

    // Y luego repetir el ciclo cada 12 horas (43200000 ms)
    setInterval(() => {
      syncGpsImeis().catch(err => console.error("Error periódico Sync IMEI:", err));

      setTimeout(() => {
        syncProtrackMileage().catch(err => console.error("Error periódico Daemon Kilometraje:", err));
      }, 30000); // 30s después del emparejamiento cíclico

    }, 43200000);
  }, 10000); // 10 segundos después del inicio
});