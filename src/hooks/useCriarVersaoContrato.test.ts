import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useCriarVersaoContrato } from './useContratosRenting';

/**
 * Uma troca de viatura falhava com o toast "Erro inesperado" e mais nada. A
 * causa real vinha do Postgres — o contrato #577 tinha `data_fim` já no
 * passado, e a RPC montava o sucessor com `data_inicio` = data da troca e
 * `data_fim` = a data antiga, o que inverte o `periodo` (coluna gerada
 * `tstzrange(data_inicio, data_fim, '[)')`) e rebenta com
 * "range lower bound must be less than or equal to range upper bound".
 *
 * Essa mensagem nunca chegou ao ecrã: o hook usava `error instanceof Error`,
 * e um PostgrestError é um objecto plain. Mesma armadilha que o fix de 10/07
 * já tinha arrumado em useCreateContratoRenting — este hook ficou de fora.
 *
 * Vive em ficheiro próprio (e não em useContratosRenting.test.ts) só porque
 * esse já está no limite de 500 linhas do `max-lines`.
 */

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

/** Mocka supabase.rpc para devolver o erro dado, no shape real do Supabase. */
function mockRpcError(error: Record<string, unknown>) {
  (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = vi
    .fn()
    .mockResolvedValue({ data: null, error });
}

async function correrMutation() {
  const { result } = renderHook(() => useCriarVersaoContrato(), { wrapper: createWrapper() });
  await act(async () => {
    await result.current
      .mutateAsync({ contratoId: 'c-577', motivo: 'Manutenção' })
      .catch(() => undefined);
  });
}

describe('useCriarVersaoContrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra a mensagem real do Postgres quando a RPC falha (não "Erro inesperado")', async () => {
    // Shape real de um erro do Supabase: plain object, NÃO instanceof Error.
    mockRpcError({
      message: 'range lower bound must be less than or equal to range upper bound',
      code: '22000',
      details: null,
      hint: null,
    });

    await correrMutation();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('range lower bound'),
        variant: 'destructive',
      })
    );
    const call = toastMock.mock.calls[0][0] as { description: string };
    expect(call.description).not.toMatch(/erro inesperado/i);
  });

  it('reconhece um conflito de disponibilidade em vez de despejar o texto cru', async () => {
    mockRpcError({
      message: 'conflicting key value violates exclusion constraint "contratos_no_overbooking"',
      code: '23P01',
      details: null,
      hint: null,
    });

    await correrMutation();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Conflito de disponibilidade', variant: 'destructive' })
    );
  });

  it('passa a viatura nova à RPC — é o que impede o sucessor de reocupar a antiga', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'novo-id', error: null });
    (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = rpc;

    const { result } = renderHook(() => useCriarVersaoContrato(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        contratoId: 'c-577',
        motivo: 'Manutenção',
        dataTroca: '2026-08-28T16:45:00.000Z',
        viaturaId: 'viatura-nova',
      });
    });

    expect(rpc).toHaveBeenCalledWith(
      'criar_versao_contrato_renting',
      expect.objectContaining({
        p_contrato_id: 'c-577',
        p_data_troca: '2026-08-28T16:45:00.000Z',
        p_viatura_id: 'viatura-nova',
      })
    );
  });

  it('sem viatura indicada envia null — versionar sem trocar de viatura continua a funcionar', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'novo-id', error: null });
    (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = rpc;

    const { result } = renderHook(() => useCriarVersaoContrato(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ contratoId: 'c-577', motivo: 'Correcção' });
    });

    expect(rpc).toHaveBeenCalledWith(
      'criar_versao_contrato_renting',
      expect.objectContaining({ p_viatura_id: null })
    );
  });
});
