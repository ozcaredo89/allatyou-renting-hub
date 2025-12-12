import "dotenv/config";
import express, { Request, Response } from "express";
import cors, { CorsOptionsDelegate } from "cors";
import { basicAuth } from "./middleware/basicAuth";

import advancesRoutes from "./routes/advances";
import drivers from "./routes/drivers";
import emailTestRouter from "./routes/emailTest";
import expenses from "./routes/expenses";
import investmentsRoutes from "./routes/investments";
import ledgerRoutes from "./routes/ledger";
import metricsRouter from "./routes/metrics";
import noPayRoutes from "./routes/noPay";
import payments from "./routes/payments";
import uploads from "./routes/uploads";
// Si tienes DOS routers distintos bajo /reports, déjalos; si no, elimina el que sobre.
import reports from "./routes/reports";
import profitRoutes from "./routes/profit";
import remindersRoutes from "./routes/reminders";

const app = express();

/** CORS: WEB_ORIGIN (puede ser lista separada por comas) + localhost + *.vercel.app */
const corsOptions: CorsOptionsDelegate = (req, cb) => {
  const origin = (req.headers?.origin as string) || "";

  // Soportar varios orígenes en WEB_ORIGIN separados por coma
  const envOrigins = (process.env.WEB_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowList = [
    ...envOrigins,
    "http://localhost:5173",
  ];

  let allowed = false;
  try {
    const host = origin ? new URL(origin).host : "";
    allowed = allowList.includes(origin) || host.endsWith(".vercel.app");
  } catch {
    // si new URL falla, dejamos allowed = false
  }

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
app.use("/expenses", expenses);
app.use("/investments", investmentsRoutes);
app.use("/metrics", metricsRouter);
app.use("/no-pay", noPayRoutes);
app.use("/reminders", remindersRoutes);

/** Rutas protegidas con Basic Auth (monta el middleware en la misma línea) */
app.use("/reports", basicAuth, profitRoutes);
app.use("/reports", basicAuth, reports);
app.use("/ledger",  basicAuth, ledgerRoutes);
app.use("/advances", basicAuth, advancesRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API up on http://localhost:${PORT}`);
});
