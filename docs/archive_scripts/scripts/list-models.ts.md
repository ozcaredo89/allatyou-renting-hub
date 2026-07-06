import dotenv from "dotenv";
dotenv.config();

async function listModels() {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
  );
  const json: any = await res.json();
  
  if (!res.ok) {
    console.error("Error:", json);
    return;
  }

  const models = json.models || [];
  const flashModels = models.filter((m: any) => m.name.includes("flash"));
  
  console.log(`\nTotal modelos disponibles: ${models.length}`);
  console.log("\nModelos Flash disponibles:");
  for (const m of flashModels) {
    const methods = m.supportedGenerationMethods?.join(", ") || "";
    if (methods.includes("generateContent")) {
      console.log(`  ✅ ${m.name}`);
    } else {
      console.log(`  ❌ ${m.name} (no soporta generateContent)`);
    }
  }
}

listModels().catch(console.error);
