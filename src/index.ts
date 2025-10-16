import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import payments from "./routes/payments";

const app = express();

// Allows Vercel or custom domin and also localhost for dev.
const ALLOWED_ORIGINS = [
  process.env.WEB_ORIGIN,         // example https://allatyou-renting-hub.vercel.app  or  https://allatyou.com
  "http://localhost:5173"
].filter(Boolean) as string[];

app.use(cors({ origin: ALLOWED_ORIGINS }));

app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.send("AllAtYou Renting API ✅");
});

app.use("/payments", payments);  // <-- luego registras el router

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API up on http://localhost:${PORT}`);
});
