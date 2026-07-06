import { supabase } from "./src/lib/supabase";

async function run() {
  const { data, error } = await supabase
    .from("receipt_uploads")
    .select("*")
    .order("id", { ascending: false })
    .limit(5);
    
  console.log("Uploads:", data);
}

run();
