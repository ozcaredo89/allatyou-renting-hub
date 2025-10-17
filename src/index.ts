import "dotenv/config";
import express, { Request, Response } from "express";
import cors, { CorsOptionsDelegate } from "cors";
import payments from "./routes/payments";
import uploads from "./routes/uploads"; 

const app = express();

/** CORS: WEB_ORIGIN + localhost + *.vercel.app (previews) */
const corsOptions: CorsOptionsDelegate = (req, cb) => {
  // En CorsRequest no existe .header(), tomamos el header directamente
  const origin = (req.headers?.origin as string) || "";

  const allowList = [
    process.env.WEB_ORIGIN,       // ej: https://allatyou-renting-hub.vercel.app  (luego: https://allatyou.com)
    "http://localhost:5173",
  ].filter(Boolean) as string[];

  let allowed = false;
  try {
    const host = origin ? new URL(origin).host : "";
    allowed = allowList.includes(origin) || host.endsWith(".vercel.app");
  } catch { /* origin vacío o inválido */ }

  cb(null, { origin: allowed, optionsSuccessStatus: 200 });
};

app.use(cors(corsOptions));
app.use(express.json());

/** Logger temporal para depurar en Railway */
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.path} origin=${req.headers.origin ?? "-"}`);
  next();
});

app.get("/", (_req: Request, res: Response) => {
  res.send("AllAtYou Renting API ✅");
});

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

app.use("/uploads", uploads);
app.use("/payments", payments);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API up on http://localhost:${PORT}`);
});
