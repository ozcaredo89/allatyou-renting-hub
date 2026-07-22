import { supabase } from './src/lib/supabase'; async function run() { const { data } = await supabase.from('drivers').select('*').limit(1); console.log(Object.keys(data[0])); } run();  
