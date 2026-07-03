/**
 * Smart Rate Limiter para llamadas a IA.
 * Utiliza un algoritmo de Sliding Window para llevar la cuenta exacta de peticiones
 * por minuto de cada modelo, asegurando que no se supere el RPM permitido (si está definido).
 */

export class RateLimiter {
  private state = new Map<string, { timestamps: number[]; dailyExhausted: boolean }>();

  /**
   * Adquiere un permiso para ejecutar la petición.
   * Si se superan las peticiones por minuto (limitRpm), el hilo espera (sleep)
   * exactamente lo necesario hasta que haya cupo en la ventana de 1 minuto.
   */
  async acquire(modelId: string, limitRpm: number): Promise<void> {
    if (!this.state.has(modelId)) {
      this.state.set(modelId, { timestamps: [], dailyExhausted: false });
    }
    const st = this.state.get(modelId)!;

    if (st.dailyExhausted) {
      throw new Error(`DAILY_QUOTA_EXHAUSTED:${modelId}`);
    }

    // limitRpm <= 0 indica que no se quiere limitar internamente por RPM
    if (limitRpm <= 0) return;

    while (true) {
      const now = Date.now();
      // Remover marcas de tiempo que ya salieron de la ventana de 60 segundos
      st.timestamps = st.timestamps.filter(t => now - t < 60000);

      if (st.timestamps.length < limitRpm) {
        // Hay cupo, registrar la petición y continuar
        st.timestamps.push(now);
        return;
      }

      // No hay cupo. Calcular cuánto falta para que el timestamp más antiguo expire.
      const oldest = st.timestamps[0] ?? now;
      const waitTime = (oldest + 60000) - now;
      
      // Esperar ese tiempo más un ligero buffer (50ms)
      await new Promise(r => setTimeout(r, Math.max(0, waitTime) + 50));
    }
  }

  /**
   * Marca un modelo como con cuota diaria agotada para saltarlo inmediatamente
   * en futuras peticiones.
   */
  reportDailyExhausted(modelId: string) {
    if (!this.state.has(modelId)) {
      this.state.set(modelId, { timestamps: [], dailyExhausted: true });
    } else {
      this.state.get(modelId)!.dailyExhausted = true;
    }
  }
}

export const aiRateLimiter = new RateLimiter();
