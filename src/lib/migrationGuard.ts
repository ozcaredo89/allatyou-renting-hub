// src/lib/migrationGuard.ts
// Issue #55: el API no arranca si la base no tiene aplicadas todas las migraciones del repo.
// Así, si el job de migraciones falla, el healthcheck de Railway falla y producción sigue
// con el deploy anterior (que sí corresponde al esquema actual).
// Spec: docs/specs/variables-entorno.md (§ Migraciones)
import fs from "fs";
import path from "path";
import { supabase } from "./supabase";
import { isProduction } from "./env";

// src/lib y dist/lib están ambos a dos niveles de la raíz del repo
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "supabase", "migrations");

// Railway puede arrancar el API mientras el job de migraciones aún corre: se reintenta
// dentro del margen del healthcheck (railway.json: 120 s).
const RETRY_EVERY_MS = 10_000;
const MAX_WAIT_MS = 90_000;

function expectedVersions(): string[] | null {
  if (!fs.existsSync(MIGRATIONS_DIR)) return null;
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .map((f) => /^(\d+)_.*\.sql$/.exec(f)?.[1])
    .filter((v): v is string => Boolean(v));
}

async function missingVersions(expected: string[]): Promise<string[]> {
  const { data, error } = await supabase.rpc("applied_migration_versions");
  if (error) throw new Error(`No se pudo leer el historial de migraciones: ${error.message}`);
  const applied = new Set((data as unknown as string[]) || []);
  return expected.filter((v) => !applied.has(v));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resuelve si el esquema está al día. En producción termina el proceso si no lo está. */
export async function ensureMigrationsApplied(): Promise<void> {
  const expected = expectedVersions();
  if (!expected) {
    console.warn(`⚠️ [migrations] No se encontró ${MIGRATIONS_DIR}; se omite la verificación de esquema.`);
    return;
  }

  const started = Date.now();
  let lastProblem = "";
  for (;;) {
    try {
      const missing = await missingVersions(expected);
      if (missing.length === 0) {
        console.log(`✅ [migrations] Esquema al día (${expected.length} migraciones).`);
        return;
      }
      lastProblem = `Migraciones sin aplicar en la base: ${missing.join(", ")}`;
    } catch (e) {
      lastProblem = (e as Error).message;
    }

    if (!isProduction()) {
      console.warn(`⚠️ [migrations] ${lastProblem} (en producción el API no arrancaría).`);
      return;
    }
    if (Date.now() - started >= MAX_WAIT_MS) break;
    console.warn(`⏳ [migrations] ${lastProblem}. Reintentando en ${RETRY_EVERY_MS / 1000}s...`);
    await sleep(RETRY_EVERY_MS);
  }

  console.error(
    `❌ [migrations] ${lastProblem}.\n` +
      `   El API no arranca para no servir código sobre un esquema viejo. Revisa el job "Migraciones Supabase" en GitHub Actions.`
  );
  process.exit(1);
}
