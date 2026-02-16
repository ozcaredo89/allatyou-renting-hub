import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import dotenv from "dotenv";

dotenv.config();

// Verificación de seguridad (Opcional, pero recomendada para evitar errores raros luego)
if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
  console.error("⚠️  ADVERTENCIA: Faltan variables de entorno de R2 (Cloudflare) en el archivo .env");
}

// Inicializamos el cliente S3
const r2 = new S3Client({
  region: "auto",
  // CORRECCIÓN AQUÍ: Agregamos '|| ""' para asegurar que siempre sea string
  endpoint: process.env.R2_ENDPOINT || "", 
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

/**
 * Sube un archivo a R2 y retorna la URL pública
 */
export async function uploadToR2(file: Express.Multer.File, folder: string = "general"): Promise<string> {
  // Limpiamos el nombre
  const cleanName = file.originalname.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "");
  const fileName = `${folder}/${Date.now()}_${cleanName}`;

  const upload = new Upload({
    client: r2,
    params: {
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    },
  });

  await upload.done();

  return `${process.env.R2_PUBLIC_URL}/${fileName}`;
}