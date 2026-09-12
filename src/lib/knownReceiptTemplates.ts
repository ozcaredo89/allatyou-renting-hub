// src/lib/knownReceiptTemplates.ts
// Fuente única de verdad para hashes de imágenes de plantillas conocidas
// que NO son comprobantes bancarios reales.
//
// Para agregar una variante nueva, basta con añadir el hash SHA-256 aquí.
// El frontend y el backend usan la misma lista vía GET /uploads/templates.

export const NO_DRIVER_IMAGE_HASHES: readonly string[] = [
  // Imagen oficial "VEHÍCULO SIN CONDUCTOR" (gris con letras blancas, 1024×664px)
  "a25fe3f719e8fbc63fefcf886b3eb5355ad213fd516652d027e2701d7aa3269b",
];
