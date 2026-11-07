// scripts/check-env.js
// CI (Issue #18): falla si el código usa variables de entorno que no están declaradas
// en el registro (src/lib/env.ts para el API, web/src/vite-env-required.ts para el frontend).
// Uso: node scripts/check-env.js
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

function collect(files, patterns, ignore = new Set()) {
  const used = new Map(); // nombre -> primer archivo donde aparece
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const name = m[1];
        if (!ignore.has(name) && !used.has(name)) used.set(name, path.relative(ROOT, f));
      }
    }
  }
  return used;
}

function declared(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  return new Set([...src.matchAll(/name:\s*"([A-Z0-9_]+)"/g)].map((m) => m[1]));
}

let failed = false;

// --- API ---
const apiDeclared = declared("src/lib/env.ts");
const apiUsed = collect(
  walk(path.join(ROOT, "src")),
  [
    /process\.env\.([A-Z0-9_]+)/g,
    /process\.env\[\s*["'`]([A-Z0-9_]+)["'`]\s*\]/g,
    /requireEnv\(\s*["'`]([A-Z0-9_]+)["'`]\s*\)/g,
  ],
  // Variables que inyecta la plataforma, no se configuran a mano
  new Set(["NODE_ENV", "RAILWAY_ENVIRONMENT_NAME"])
);
for (const [name, file] of apiUsed) {
  if (!apiDeclared.has(name)) {
    console.error(`❌ API: ${name} (usada en ${file}) no está declarada en src/lib/env.ts`);
    failed = true;
  }
}

// --- Web ---
const webDeclared = declared("web/src/vite-env-required.ts");
const webUsed = collect(
  walk(path.join(ROOT, "web", "src")),
  [/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g]
);
for (const [name, file] of webUsed) {
  if (!webDeclared.has(name)) {
    console.error(`❌ Web: ${name} (usada en ${file}) no está declarada en web/src/vite-env-required.ts`);
    failed = true;
  }
}

if (failed) {
  console.error("\nDeclara la variable (required/optional) y configúrala en Railway/Vercel antes de mergear.");
  process.exit(1);
}
console.log(`✅ Variables declaradas: API ${apiUsed.size} usadas, Web ${webUsed.size} usadas.`);
