import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// --- CONFIGURACIÓN ---
const BUCKET_NAME = 'proofs';
const FOLDER_NAME = 'proofs'; // <--- AQUÍ ESTABA EL TRUCO (La subcarpeta)
const CUTOFF_DATE = new Date('2025-11-01T00:00:00Z'); 

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan credenciales en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function forcePruneSubfolder() {
  console.log(`🔥 MODO DESTRUCTIVO: Borrando en bucket '${BUCKET_NAME}', carpeta '${FOLDER_NAME}/'`);
  console.log(`📅 Anterior a: ${CUTOFF_DATE.toISOString()}`);
  
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    // 1. Listar archivos DENTRO de la carpeta 'proofs'
    const { data: files, error } = await supabase
      .storage
      .from(BUCKET_NAME)
      .list(FOLDER_NAME, { // <--- Buscamos dentro de la carpeta
        limit: 100, 
        offset: 0, 
        sortBy: { column: 'created_at', order: 'asc' } 
      });

    if (error) {
      console.error('❌ Error listando:', error.message);
      break;
    }

    if (!files || files.length === 0) {
      console.log('✅ La carpeta está vacía o no quedan archivos viejos.');
      break;
    }

    // 2. Filtrar solo los viejos
    const filesToDelete = files
      .filter(file => {
        if (!file.metadata) return false; 
        return new Date(file.created_at) < CUTOFF_DATE;
      })
      .map(f => `${FOLDER_NAME}/${f.name}`); // <--- IMPORTANTE: Agregamos la ruta completa (proofs/archivo.jpg)

    if (filesToDelete.length > 0) {
      console.log(`🗑️  Borrando lote de ${filesToDelete.length} archivos...`);
      
      // 3. Borrar (usando la ruta completa)
      const { error: delErr } = await supabase
        .storage
        .from(BUCKET_NAME)
        .remove(filesToDelete);

      if (delErr) {
        console.error('❌ Error borrando:', delErr.message);
        break; 
      }
      
      totalDeleted += filesToDelete.length;
      console.log(`   ➜ ${filesToDelete.length} eliminados.`);
    } else {
      console.log('✅ No quedan archivos viejos en este lote.');
      hasMore = false;
    }
  }

  console.log(`\n💤 LISTO. Total archivos eliminados: ${totalDeleted}.`);
}

forcePruneSubfolder();