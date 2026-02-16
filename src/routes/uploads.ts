import { Router, Request, Response } from "express";
import multer from "multer";
import { uploadToR2 } from "../lib/r2";

const r = Router();

// Configuración de Multer (Subida en memoria)
// Aumenté un poco el límite a 10MB por si las fotos de los carros son pesadas
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 10 * 1024 * 1024 } 
});

r.post("/", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "file is required" });

    // --- 1. VALIDACIÓN (Mantenemos tu lógica original) ---
    // Esto es muy bueno, evita que suban .exe o scripts raros
    const isImage = file.mimetype.startsWith("image/");
    const isPdf = file.mimetype === "application/pdf";

    if (!isImage && !isPdf) {
        return res.status(400).json({ error: "Only image files and PDFs are allowed" });
    }
    // ----------------------------------------------------

    // 2. Decidir carpeta
    // Si el frontend manda un campo "folder", lo usamos. Si no, va a "proofs" por defecto.
    // Esto mantiene la compatibilidad con lo que ya tenías.
    const folder = req.body.folder || "proofs";

    console.log(`📤 Subiendo a R2 [${folder}]: ${file.originalname}`);

    // --- 3. SUBIDA A CLOUDFLARE R2 ---
    // Esta función hace toda la magia y nos devuelve la URL pública final
    const publicUrl = await uploadToR2(file, folder);

    console.log(`✅ Éxito: ${publicUrl}`);

    // 4. Respuesta al Frontend
    // El frontend recibe { url: "..." } tal como antes. ¡No se dará ni cuenta del cambio!
    return res.status(201).json({ url: publicUrl });

  } catch (e: any) {
    console.error("❌ Error en upload:", e);
    return res.status(500).json({ error: e.message || "upload failed" });
  }
});

export default r;