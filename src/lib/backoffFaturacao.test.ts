import { describe, it, expect } from 'vitest';
// Fonte única — o ficheiro é TS puro, sem APIs de Deno, por isso o Vitest importa-o.
import {
  BACKOFF_SEGUNDOS,
  proximaTentativa,
} from '../../supabase/functions/_shared/acordos/backoff';

const agora = new Date('2026-07-24T10:00:00Z');

describe('proximaTentativa', () => {
  it('primeira falha espera 60 segundos', () => {
    expect(proximaTentativa(1, agora)?.toISOString()).toBe('2026-07-24T10:01:00.000Z');
  });

  it('segunda falha espera 5 minutos', () => {
    expect(proximaTentativa(2, agora)?.toISOString()).toBe('2026-07-24T10:05:00.000Z');
  });

  it('devolve null quando esgota as tentativas', () => {
    expect(proximaTentativa(BACKOFF_SEGUNDOS.length + 1, agora)).toBeNull();
  });

  it('tem exactamente 5 escaloes ate 6 horas', () => {
    expect(BACKOFF_SEGUNDOS).toEqual([60, 300, 900, 3600, 21600]);
  });
});
