import { supabase } from './src/lib/supabase';

async function getSchema() {
  const tables = ['drivers', 'vehicles', 'vehicle_assignments', 'deposits', 'advances', 'amortizations', 'loans', 'expenses'];
  
  for (const table of tables) {
    console.log(`\n--- TABLE: ${table} ---`);
    // Getting one row to infer structure since information_schema might require postgres direct access
    const { data, error } = await supabase.from(table).select('*').limit(1);
    
    if (error) {
      console.error(`Error or table doesn't exist: ${error.message}`);
    } else {
      if (data && data.length > 0) {
        console.log(Object.keys(data[0]).map(k => `${k}: ${data[0][k] === null ? 'null' : typeof data[0][k]}`).join('\n'));
      } else {
        console.log(`Table ${table} exists but is empty.`);
      }
    }
  }
}

getSchema();
