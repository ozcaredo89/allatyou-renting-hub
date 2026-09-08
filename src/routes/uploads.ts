import { Router, Request, Response } from "express";
import multer from "multer";
import { uploadToR2 } from "../lib/r2";
import { parseReceipt } from "../lib/ocr";
import { supabase } from "../lib/supabase";

const r = Router();

// Configuración de Multer (Subida en memoria)
// Soporta PDFs de contratos escaneados y fotos de alta resolución hasta 30MB
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 30 * 1024 * 1024 } 
});

r.post("/", (req: Request, res: Response, next) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ 
            error: "El archivo es demasiado pesado (máximo 30MB). Por favor comprímelo antes de subirlo." 
          });
        }
        return res.status(400).json({ error: `Error en la subida: ${err.message}` });
      }
      return res.status(500).json({ error: err.message || "Error procesando el archivo" });
    }
    next();
  });
}, async (req: Request, res: Response) => {
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

    // --- 3. SUBIDA A CLOUDFLARE R2 Y OCR CONCURRENTE ---
    let publicUrl: string;
    let ocrData = null;
    let upload_id: number | null = null;

    if (folder === "proofs" && isImage) {
      // Intentamos subir a R2 y parsear OCR
      try {
        const [urlResult, ocrResult] = await Promise.all([
          uploadToR2(file, folder),
          parseReceipt(file.buffer, file.mimetype).catch(err => {
            console.warn("⚠️ OCR error (no crítico):", err);
            return null;
          })
        ]);
        publicUrl = urlResult;
        ocrData = ocrResult;
        
        if (ocrData) {
          // Guardar en la DB de forma segura (Zero-Trust)
          const { data: dbRecord, error: dbError } = await supabase
            .from("receipt_uploads")
            .insert([{
              url: publicUrl,
              reference_number: ocrData.reference_number,
              provider_name: ocrData.provider_name,
              receipt_date: ocrData.receipt_date,
              amount: ocrData.amount,
              ocr_status: ocrData.status
            }])
            .select("id")
            .single();
            
          if (!dbError && dbRecord) {
            upload_id = dbRecord.id;
          } else {
            console.error("❌ Error guardando receipt_uploads:", dbError);
          }
        }
      } catch (uploadErr: any) {
        console.error("❌ Error en uploadToR2 con OCR:", uploadErr);
        throw uploadErr;
      }
    } else {
      // Solo subimos a R2
      publicUrl = await uploadToR2(file, folder);
    }

    console.log(`✅ Éxito: ${publicUrl}`);

    // 4. Respuesta al Frontend
    // El frontend recibe { url: "...", upload_id: 123, ocrData: {...} }
    return res.status(201).json({ url: publicUrl, upload_id, ocrData });

  } catch (e: any) {
    console.error("❌ Error en upload:", e);
    return res.status(500).json({ error: e.message || "upload failed" });
  }
});

export default r;