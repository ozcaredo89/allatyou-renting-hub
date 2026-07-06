import "dotenv/config";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const d = await r.json();
  console.log((d as any).models.map((m: any) => m.name));
}
run();
