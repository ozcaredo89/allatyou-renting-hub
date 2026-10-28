/**
 * Comprime y redimensiona imágenes en el navegador antes de subirlas al almacenamiento (R2).
 * Reduce fotos de celular de 5MB-15MB a ~150KB-300KB conservando alta definición visual,
 * optimizando el ancho de banda y protegiendo el almacenamiento de Cloudflare R2.
 */
export async function compressImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    mimeType?: string;
  } = {}
): Promise<File> {
  // Si no es una imagen (ej: PDF), retornar el archivo original
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // Si ya es un SVG o GIF animado, no alterar
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }

  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.8,
    mimeType = "image/jpeg",
  } = options;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file); // Fallback al archivo original si hay error
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        try {
          let { width, height } = img;

          // Calcular nuevas dimensiones conservando aspect ratio
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            resolve(file);
            return;
          }

          // Fondo blanco para imágenes transparentes que se convierten a JPEG
          if (mimeType === "image/jpeg") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }
              const extension = mimeType === "image/webp" ? "webp" : "jpg";
              const cleanBaseName = file.name.replace(/\.[^/.]+$/, "");
              const compressedFile = new File([blob], `${cleanBaseName}.${extension}`, {
                type: mimeType,
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            },
            mimeType,
            quality
          );
        } catch {
          resolve(file);
        }
      };
      img.src = (e.target?.result as string) || "";
    };
    reader.readAsDataURL(file);
  });
}
