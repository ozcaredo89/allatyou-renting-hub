// src/validateEnv.ts
// Se importa en src/index.ts justo después de "dotenv/config" y ANTES de cualquier otro módulo,
// para que la validación corra antes de que otros módulos lean process.env al cargarse (Issue #18).
import { validateEnvOrExit } from "./lib/env";

validateEnvOrExit();
