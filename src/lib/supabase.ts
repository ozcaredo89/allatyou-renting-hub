import { createClient } from "@supabase/supabase-js";
import * as dotenv from 'dotenv';
import path from 'path';

// Asegurar que el .env se cargue sin importar desde dónde se ejecute el script
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const url = process.env.SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE!; // solo backend

if (!url || !serviceRole) {
  throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE en .env");
}

export const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false }
});
