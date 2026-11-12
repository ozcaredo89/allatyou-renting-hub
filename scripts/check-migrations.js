// scripts/check-migrations.js
// CI (Issue #55): falla si dos migraciones comparten versión o si un archivo no sigue
// el formato YYYYMMDDNN_descripcion.sql. Supabase toma como versión los dígitos antes
// del primer "_": dos archivos con la misma versión hacen fallar `supabase db push` en main.
// Uso: node scripts/check-migrations.js
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "..", "supabase", "migrations");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));

let failed = false;
const byVersion = new Map();
for (const f of files) {
  const m = /^(\d{10})_[a-z0-9_]+\.sql$/.exec(f);
  if (!m) {
    console.error(`❌ Nombre inválido: ${f} (esperado YYYYMMDDNN_descripcion.sql, minúsculas)`);
    failed = true;
    continue;
  }
  const list = byVersion.get(m[1]) || [];
  list.push(f);
  byVersion.set(m[1], list);
}

for (const [version, list] of byVersion) {
  if (list.length > 1) {
    console.error(`❌ Versión duplicada ${version}:\n   - ${list.join("\n   - ")}\n   Renombra la tuya con la siguiente secuencia libre del día.`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`✅ Migraciones: ${files.length} archivos, versiones únicas.`);
