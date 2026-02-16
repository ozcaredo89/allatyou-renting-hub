import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno (Asegúrate de tener tu .env accesible)
dotenv.config({ path: './.env' }); // Ajusta la ruta si es necesario

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE || '';

console.log("--- Diagnóstico ---");
console.log("URL:", SUPABASE_URL ? "✅ Cargada" : "❌ Falta (Busqué 'SUPABASE_URL')");
console.log("KEY:", SUPABASE_SERVICE_ROLE_KEY ? "✅ Cargada" : "❌ Falta (Busqué 'SUPABASE_SERVICE_ROLE')");
console.log("-------------------");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan las credenciales de Supabase (URL o SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET_NAME = 'proofs';
const CUTOFF_DATE = '2025-11-01'; // Fecha de corte

async function runCleanup() {
  console.log(`🔍 Buscando pagos anteriores a ${CUTOFF_DATE} con comprobantes...`);

  // 1. Buscar los pagos viejos que tienen proof_url
  // Nota: Traemos por lotes para no saturar la memoria si son miles
  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, proof_url, payment_date')
    .lt('payment_date', CUTOFF_DATE)
    .not('proof_url', 'is', null);

  if (error) {
    console.error('Error consultando pagos:', error);
    return;
  }

  if (!payments || payments.length === 0) {
    console.log('✅ No hay pagos viejos con archivos para borrar.');
    return;
  }

  console.log(`📄 Encontrados ${payments.length} pagos para procesar.`);

  // 2. Extraer las rutas de los archivos (File Paths)
  // Dependiendo de cómo guardes la URL, puede ser una URL completa o solo el path.
  // Ejemplo URL completa: https://xyz.supabase.co/.../public/proofs/carpeta/foto.jpg
  // Necesitamos solo: "carpeta/foto.jpg"
  
  const filesToDelete: string[] = [];
  const paymentIdsToUpdate: number[] = [];

  for (const p of payments) {
    if (!p.proof_url) continue;

    // Lógica para extraer el path limpio relativo al bucket
    let cleanPath = p.proof_url;

    // Si guardas la URL pública completa, la limpiamos:
    if (p.proof_url.includes(`${BUCKET_NAME}/`)) {
        // Rompemos la URL para obtener todo lo que está DESPUÉS del nombre del bucket
        const parts = p.proof_url.split(`${BUCKET_NAME}/`);
        if (parts.length > 1) {
            cleanPath = parts[1]; // "carpeta/archivo.jpg"
        }
    }
    
    // Decodificar por si tiene espacios (%20) u otros caracteres
    cleanPath = decodeURIComponent(cleanPath);

    filesToDelete.push(cleanPath);
    paymentIdsToUpdate.push(p.id);
  }

  if (filesToDelete.length === 0) {
    console.log('⚠️ No se pudieron extraer rutas de archivos válidas.');
    return;
  }

  console.log(`🗑️ Intentando borrar ${filesToDelete.length} archivos del bucket '${BUCKET_NAME}'...`);

  // 3. Borrar archivos de Storage (En lotes de 100 para ser seguros)
  const BATCH_SIZE = 50;
  for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
      const batch = filesToDelete.slice(i, i + BATCH_SIZE);
      const { data: deleteData, error: deleteError } = await supabase
        .storage
        .from(BUCKET_NAME)
        .remove(batch);

      if (deleteError) {
          console.error(`❌ Error borrando lote ${i}:`, deleteError.message);
      } else {
          console.log(`✅ Lote ${i} borrado. Archivos eliminados:`, deleteData.length);
      }
  }

  // 4. Actualizar la tabla de pagos para poner proof_url en NULL
  console.log('🔄 Actualizando referencias en base de datos...');
  
  const { error: updateError } = await supabase
    .from('payments')
    .update({ proof_url: null }) // O pon un string como 'ELIMINADO_POR_LIMPIEZA'
    .in('id', paymentIdsToUpdate);

  if (updateError) {
    console.error('❌ Error actualizando tabla payments:', updateError.message);
  } else {
    console.log('✨ ¡Limpieza completada con éxito!');
  }
}

runCleanup();