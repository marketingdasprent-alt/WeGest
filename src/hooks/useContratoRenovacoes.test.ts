import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const h = vi.hoisted(() => ({
  chamadas: [] as Array<[string, unknown[]]>,
  resposta: { data: [] as unknown[], error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((tabela: string) => {
      h.chamadas.push(['from', [tabela]]);
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'like']) {
        b[m] = vi.fn((...args: unknown[]) => {
          h.chamadas.push([m, args]);
          return b;
        });
      }
      b.order = vi.fn(() => Promise.resolve(h.resposta));
      return b;
    }),
  },
}));

import { lerRenovacao, useContratoRenovacoes } from './useContratoRenovacoes';

const linha = (detalhe: string | null, id = 'h1') => ({
  id,
  contrato_id: 'c1',
  detalhe,
  criado_em: '2026-09-24T16:15:40Z',
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  h.chamadas = [];
  h.resposta = { data: [], error: null };
});

describe('lerRenovacao', () => {
  it('lê as renovações sem versão (08-09 a 24-09)', () => {
    const r = lerRenovacao(
      linha(
        'Renovado em 24/09/2026. Próxima renovação: 24/10/2026. A data de início do contrato mantém-se.'
      )
    );
    expect(r).toMatchObject({ id: 'h1', proxima: '24/10/2026' });
  });

  it('deixa de fora as reaberturas de legado — criaram versão e já estão nas versões', () => {
    expect(
      lerRenovacao(
        linha(
          'Renovado em 24/09/2026 depois de ter terminado a 10/01/2026. Continua na versão 2, a partir de hoje.'
        )
      )
    ).toBeNull();
    expect(
      lerRenovacao(
        linha(
          'Reaberto em 24/09/2026 por renovação (continua a versão 1). Próxima renovação: 24/10/2026.'
        )
      )
    ).toBeNull();
  });

  it('deixa de fora as renovações com versão e as outras alterações', () => {
    expect(
      lerRenovacao(linha('Renovação da versão 1. Próxima renovação a 24/10/2026.'))
    ).toBeNull();
    expect(lerRenovacao(linha('agendado → em_curso'))).toBeNull();
    expect(lerRenovacao(linha(null))).toBeNull();
  });
});

describe('useContratoRenovacoes', () => {
  it('procura em contrato_historico em toda a cadeia de versões', async () => {
    h.resposta = {
      data: [linha('Renovado em 24/09/2026. Próxima renovação: 24/10/2026.', 'h2')],
      error: null,
    };

    const { result } = renderHook(() => useContratoRenovacoes(['v1', 'v2']), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(h.chamadas).toContainEqual(['from', ['contrato_historico']]);
    expect(h.chamadas).toContainEqual(['in', ['contrato_id', ['v1', 'v2']]]);
    expect(result.current.data?.map((r) => r.id)).toEqual(['h2']);
  });

  it('não corre sem ids (contrato que não é TVDE)', () => {
    const { result } = renderHook(() => useContratoRenovacoes([]), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(h.chamadas).toHaveLength(0);
  });
});
