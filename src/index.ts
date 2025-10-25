import "dotenv/config";
import express, { Request, Response } from "express";
import cors, { CorsOptionsDelegate } from "cors";
import { basicAuth } from "./middleware/basicAuth";

import drivers from "./routes/drivers";
import expenses from "./routes/expenses";
import investmentsRoutes from "./routes/investments";
import ledgerRoutes from "./routes/ledger";
import noPayRoutes from "./routes/noPay";
import payments from "./routes/payments";
import uploads from "./routes/uploads";
import reports from "./routes/reports";
import profitRoutes from "./routes/profit";

const app = express();

/** CORS: WEB_ORIGIN + localhost + *.vercel.app (previews) */
const corsOptions: CorsOptionsDelegate = (req, cb) => {
  const origin = (req.headers?.origin as string) || "";

  const allowList = [
    process.env.WEB_ORIGIN, // e.g. https://allatyou-renting-hub.vercel.app
    "http://localhost:5173",
  ].filter(Boolean) as string[];

  let allowed = false;
  try {
    const host = origin ? new URL(origin).host : "";
    allowed = allowList.includes(origin) || host.endsWith(".vercel.app");
  } catch {}

  cb(null, { origin: allowed, optionsSuccessStatus: 200 });
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
app.use("/expenses", expenses);
app.use("/investments", investmentsRoutes);
app.use("/no-pay", noPayRoutes);

/** PROTEGER antes de montar routers sensibles */
app.use("/reports", basicAuth);
app.use("/ledger", basicAuth);

/** Rutas protegidas (ordenado, pero pueden convivir bajo el mismo prefijo) */
app.use("/reports", profitRoutes);
app.use("/reports", reports);
app.use("/ledger", ledgerRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API up on http://localhost:${PORT}`);
});
