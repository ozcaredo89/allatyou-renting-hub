// src/routes/uploads.ts
import { Router, Request, Response } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase";

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

r.post("/", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "file is required" });

    if (!file.mimetype.startsWith("image/")) return res.status(400).json({ error: "Only image files are allowed" });
    

    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `proofs/${name}`;

    const { error: upErr } = await supabase
      .storage
      .from("proofs")
      .upload(path, file.buffer, { contentType: file.mimetype });

    if (upErr) return res.status(500).json({ error: upErr.message });

    const { data } = supabase.storage.from("proofs").getPublicUrl(path);
    return res.status(201).json({ url: data.publicUrl });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "upload failed" });
  }
});

export default r;
