import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { WEB_ENV_VARS } from './src/vite-env-required.ts'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Issue #18: el build de producción falla si falta una variable requerida, así Vercel no publica
  if (command === 'build' && mode === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const missing = WEB_ENV_VARS.filter(v => v.required && !String(env[v.name] || '').trim())
    if (missing.length > 0) {
      throw new Error(
        `Faltan variables de entorno requeridas para el build:\n` +
        missing.map(v => `  - ${v.name}: ${v.description}`).join('\n')
      )
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5174,
    },
  }
})
