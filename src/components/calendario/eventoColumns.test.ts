import { describe, it, expect } from 'vitest';

import { EVENTO_COLS } from './eventoColumns';

/**
 * Regressão: um typo `origen_tipo` (em vez de `origem_tipo`) escondido atrás
 * de um cast `as any` partiu as listas de handover. O `satisfies` em
 * eventoColumns.ts garante validação em compile-time; este teste fixa os
 * valores em runtime para que uma alteração errada seja apanhada também aqui.
 */
describe('EVENTO_COLS', () => {
  it('usa os nomes de coluna canónicos (origeM, não origeN)', () => {
    expect(EVENTO_COLS.origemTipo).toBe('origem_tipo');
    expect(EVENTO_COLS.origemId).toBe('origem_id');
    expect(EVENTO_COLS.realizadoEm).toBe('realizado_em');
  });
});
