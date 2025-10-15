import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import payments from "./routes/payments";

const app = express();           // <-- primero
app.use(cors());
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.send("AllAtYou Renting API ✅");
});

app.use("/payments", payments);  // <-- luego registras el router

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API up on http://localhost:${PORT}`);
});
