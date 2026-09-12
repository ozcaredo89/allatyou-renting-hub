// src/lib/documentRenderer.ts
// =============================================================================
// Motor compartido de renderizado de documentos legales:
//   - HTML → PDF (Puppeteer con márgenes y soporte A4 estricto)
//   - HTML → DOCX (html-to-docx para edición en Word)
//   - Subida a Cloudflare R2 y generación de Presigned URLs (TTL 30 min)
// =============================================================================

import puppeteer from "puppeteer";
// @ts-ignore — html-to-docx no tiene tipos TS publicados
import HTMLtoDOCX from "html-to-docx";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

dotenv.config();

export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT || "",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME || "";
export const SIGNED_URL_TTL_SECONDS = 30 * 60; // 30 minutos

/** Sube un buffer a R2 y genera una presigned URL */
export async function uploadAndSign(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return getSignedDocUrl(key);
}

/** Genera una presigned URL fresca para una clave ya existente en R2 */
export async function getSignedDocUrl(key: string): Promise<string> {
  return getSignedUrl(
    r2Client as any,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );
}

export interface RenderDualDocumentOptions {
  html: string;
  pdfKey: string;
  docxKey: string;
  pdfMargins?: { top?: string; bottom?: string; left?: string; right?: string };
}

export interface RenderDualDocumentResult {
  pdfUrl: string;
  docxUrl: string;
  pdfKey: string;
  docxKey: string;
}

/**
 * Renderiza HTML tanto a PDF (Puppeteer) como a DOCX (html-to-docx),
 * los sube a R2 a las claves especificadas (sobrescribe si ya existen)
 * y retorna las URLs firmadas de descarga.
 */
export async function renderDualDocument({
  html,
  pdfKey,
  docxKey,
  pdfMargins = { top: "2cm", bottom: "2cm", left: "2.5cm", right: "2.5cm" },
}: RenderDualDocumentOptions): Promise<RenderDualDocumentResult> {
  // 1. Renderizar PDF con Puppeteer
  let pdfBuffer: Buffer;
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-crash-reporter",
      "--disable-gpu",
      "--no-zygote",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfData = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: pdfMargins,
    });
    pdfBuffer = Buffer.from(pdfData);
  } finally {
    await browser.close();
  }

  // 2. Renderizar DOCX con html-to-docx
  const docxBuffer: Buffer = await HTMLtoDOCX(html, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
  });

  // 3. Subir ambos buffers a R2 de forma atómica
  const [pdfUrl, docxUrl] = await Promise.all([
    uploadAndSign(pdfKey, pdfBuffer, "application/pdf"),
    uploadAndSign(
      docxKey,
      docxBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
  ]);

  return {
    pdfUrl,
    docxUrl,
    pdfKey,
    docxKey,
  };
}
