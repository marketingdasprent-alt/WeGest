import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const h = vi.hoisted(() => ({
  campanhas: { data: null as unknown, error: null as unknown },
  duplicado: { data: null as unknown, error: null as unknown },
  inseridos: [] as unknown[],
  erroInsert: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((tabela: string) => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.gte = vi.fn(() => b);
      b.maybeSingle = vi.fn(() => Promise.resolve(h.duplicado));
      b.insert = vi.fn((linha: unknown) => {
        h.inseridos.push(linha);
        return Promise.resolve({ data: null, error: h.erroInsert });
      });
      // formulario_campanhas resolve na cadeia (sem maybeSingle)
      if (tabela === 'formulario_campanhas') {
        (b as unknown as { then: unknown }).then = (
          resolve: (v: unknown) => void,
          reject?: (r: unknown) => void
        ) => Promise.resolve(h.campanhas).then(resolve, reject);
      }
      return b;
    }),
  },
}));

import { aplicarRegraFormacaoTvde, useSubmeterLeadLanding } from './useLeadsLanding';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  h.campanhas = { data: null, error: null };
  h.duplicado = { data: null, error: null };
  h.inseridos = [];
  h.erroInsert = null;
});

/**
 * A regra vivia inline no meio do handler de submissão da landing pública.
 * É a única lógica de negócio daquele ficheiro e não tinha teste nenhum:
 * quem se candidata SEM formação TVDE não pode cair na campanha genérica
 * ("TVDE GERAL"), tem de ir para a campanha de formação.
 */
describe('aplicarRegraFormacaoTvde', () => {
  it('sem formação: sai de TVDE GERAL e entra em Formação TVDE', () => {
    expect(aplicarRegraFormacaoTvde(['TVDE GERAL', 'Outra'], false)).toEqual([
      'Outra',
      'Formação TVDE',
    ]);
  });

  it('sem formação e já em Formação TVDE: não duplica a tag', () => {
    expect(aplicarRegraFormacaoTvde(['TVDE GERAL', 'Formação TVDE'], false)).toEqual([
      'Formação TVDE',
    ]);
  });

  it('COM formação: não mexe nas campanhas', () => {
    expect(aplicarRegraFormacaoTvde(['TVDE GERAL'], true)).toEqual(['TVDE GERAL']);
  });

  it('sem resposta sobre formação (null): não mexe — a regra só actua no "false" explícito', () => {
    expect(aplicarRegraFormacaoTvde(['TVDE GERAL'], null)).toEqual(['TVDE GERAL']);
  });
});

describe('useSubmeterLeadLanding', () => {
  const lead = { nome: 'Ana', email: 'ana@x.pt', tem_formacao_tvde: null };

  it('candidatura repetida nos últimos 5 minutos não cria segundo lead', async () => {
    h.duplicado = { data: { id: 'lead-ja-existe' }, error: null };

    const { result } = renderHook(() => useSubmeterLeadLanding(), { wrapper });
    let r: unknown;
    await act(async () => {
      r = await result.current.mutateAsync({ formularioId: 'f1', lead });
    });

    expect(r).toEqual({ duplicado: true });
    expect(h.inseridos).toEqual([]);
  });

  it('candidatura nova junta as campanhas do formulário ao lead', async () => {
    h.campanhas = { data: [{ campanha_tag: 'TVDE GERAL' }], error: null };

    const { result } = renderHook(() => useSubmeterLeadLanding(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ formularioId: 'f1', lead });
    });

    expect(h.inseridos).toHaveLength(1);
    expect(h.inseridos[0]).toEqual(
      expect.objectContaining({ email: 'ana@x.pt', campaign_tags: ['TVDE GERAL'] })
    );
  });

  it('sem formação TVDE a regra é aplicada às campanhas do formulário', async () => {
    h.campanhas = { data: [{ campanha_tag: 'TVDE GERAL' }], error: null };

    const { result } = renderHook(() => useSubmeterLeadLanding(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        formularioId: 'f1',
        lead: { ...lead, tem_formacao_tvde: false },
      });
    });

    expect(h.inseridos[0]).toEqual(expect.objectContaining({ campaign_tags: ['Formação TVDE'] }));
  });

  it('erro no insert propaga — a landing não pode dizer "obrigado" sem ter gravado', async () => {
    h.erroInsert = { message: 'permission denied' };

    const { result } = renderHook(() => useSubmeterLeadLanding(), { wrapper });
    let erro: unknown;
    await act(async () => {
      erro = await result.current
        .mutateAsync({ formularioId: 'f1', lead })
        .catch((e: unknown) => e);
    });

    expect(erro).toEqual({ message: 'permission denied' });
  });
});
