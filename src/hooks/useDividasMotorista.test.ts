// src/hooks/useDividasMotorista.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { abertasSelect, pagasSelect, rpc, toastError, toastSuccess, ilikeSpy } = vi.hoisted(() => ({
  abertasSelect: vi.fn(),
  pagasSelect: vi.fn(),
  rpc: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  ilikeSpy: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));

// Declarações `function` (não `const`) de propósito: ficam hoisted por inteiro
// (corpo incluído) antes de o módulo correr, ao contrário de uma `const`, que
// estaria em TDZ quando o factory de vi.mock() é executado.
//
// As duas queries encadeiam .order()/.eq()/.ilike() condicionalmente — o
// .ilike() só entra quando há pesquisa. Uma cadeia rígida nunca chegaria ao
// resolver no caso sem filtros, por isso o builder aceita qualquer passo e é
// thenable: resolve quando o `await` acontecer, tenha havido os passos que
// tiver havido.
function encadeavel(tabela: string, resolver: () => Promise<unknown>) {
  const builder: any = {
    order: () => builder,
    eq: () => builder,
    lt: () => builder,
    lte: () => builder,
    gte: () => builder,
    limit: () => builder,
    ilike: (coluna: string, padrao: string) => {
      ilikeSpy(tabela, coluna, padrao);
      return builder;
    },
    then: (ok: any, ko: any) => resolver().then(ok, ko),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc,
    from: (tabela: string) => {
      if (tabela === 'motorista_liquido_semanal')
        return { select: () => encadeavel(tabela, abertasSelect) };
      if (tabela === 'dividas_motorista') return { select: () => encadeavel(tabela, pagasSelect) };
      throw new Error(`tabela inesperada: ${tabela}`);
    },
  },
}));

import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDividasMotorista,
  useMarcarDividaPaga,
  useMarcarDividaNaoPaga,
} from './useDividasMotorista';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

// Uma linha de motorista_liquido_semanal com o líquido negativo — é isso que
// a aba de Dívidas passou a mostrar, semana a semana.
const LINHA_ABERTA = {
  motorista_id: 'm-1',
  motorista_nome: 'Ana Costa',
  liquido: -120.5,
  semana_inicio: '2026-08-24',
  semana_fim: '2026-08-30',
};

/** A semana que os testes pedem. Sem ela o hook não carrega nada. */
const SEMANA = { semanaInicio: '2026-08-24', semanaFim: '2026-08-30' };

const LINHA_PAGA = {
  id: 'd-9',
  motorista_id: 'm-2',
  motorista_nome: 'Bruno Reis',
  periodo_inicio: '2026-06-01',
  periodo_fim: '2026-06-30',
  valor_periodo: -80,
  valor_danos: 0,
  valor_caucao: 0,
  valor_total: 80,
  pago_em: '2026-07-01T10:00:00Z',
  created_at: '2026-07-01T10:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  abertasSelect.mockResolvedValue({ data: [LINHA_ABERTA], error: null });
  pagasSelect.mockResolvedValue({ data: [LINHA_PAGA], error: null });
  rpc.mockResolvedValue({ data: 'd-novo', error: null });
});

describe('useDividasMotorista', () => {
  it('junta as abertas (líquido da semana) com as pagas', async () => {
    const { result } = renderHook(() => useDividasMotorista({ ...SEMANA }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.map((d) => d.estado).sort()).toEqual(['paga', 'por_cobrar']);
  });

  // Marcar uma dívida como paga muda-lhe o estado, não o lugar: se as pagas
  // fossem todas para o fundo, a linha saltava no momento do clique e lia-se
  // como tendo desaparecido.
  it('ordena por nome, sem separar pagas de por cobrar', async () => {
    pagasSelect.mockResolvedValue({
      data: [{ ...LINHA_PAGA, motorista_nome: 'Alberto Nunes' }],
      error: null,
    });
    const { result } = renderHook(() => useDividasMotorista({ ...SEMANA }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((d) => d.motorista_nome)).toEqual([
      'Alberto Nunes',
      'Ana Costa',
    ]);
    expect(result.current.data?.map((d) => d.estado)).toEqual(['paga', 'por_cobrar']);
  });

  it('a dívida em aberto usa o líquido da semana e o motorista como chave', async () => {
    const { result } = renderHook(() => useDividasMotorista({ ...SEMANA }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const aberta = result.current.data![0];
    expect(aberta.id).toBe('m-1');
    expect(aberta.valor_periodo).toBe(-120.5);
    // O total é a dívida como se lê: em positivo.
    expect(aberta.valor_total).toBe(120.5);
    // O período da linha é a SEMANA, não o intervalo dos movimentos: é ele que
    // vai para a RPC ao marcar paga, e é o que limita a liquidação.
    expect(aberta.periodo_inicio).toBe('2026-08-24');
    expect(aberta.periodo_fim).toBe('2026-08-30');
  });

  it('com o filtro "por cobrar" não vai buscar as pagas', async () => {
    const { result } = renderHook(() => useDividasMotorista({ ...SEMANA, estado: 'por_cobrar' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(abertasSelect).toHaveBeenCalled();
    expect(pagasSelect).not.toHaveBeenCalled();
    expect(result.current.data).toHaveLength(1);
  });

  it('com o filtro "paga" não vai buscar as abertas', async () => {
    const { result } = renderHook(() => useDividasMotorista({ ...SEMANA, estado: 'paga' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(pagasSelect).toHaveBeenCalled();
    expect(abertasSelect).not.toHaveBeenCalled();
  });

  it('a pesquisa filtra os dois lados pelo nome', async () => {
    const { result } = renderHook(() => useDividasMotorista({ ...SEMANA, pesquisa: 'ana' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(ilikeSpy).toHaveBeenCalledWith('motorista_liquido_semanal', 'motorista_nome', '%ana%');
    expect(ilikeSpy).toHaveBeenCalledWith('dividas_motorista', 'motorista_nome', '%ana%');
  });

  it('um erro a ler os líquidos não passa em silêncio', async () => {
    abertasSelect.mockResolvedValue({ data: null, error: { message: 'sem acesso' } });
    const { result } = renderHook(() => useDividasMotorista({ ...SEMANA }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  // Uma lista semanal sem semana não tem o que mostrar. Carregar à mesma
  // traria a conta corrente inteira, que é exactamente o que se quis acabar.
  it('sem semana escolhida não vai à base de dados', async () => {
    renderHook(() => useDividasMotorista({}), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(abertasSelect).not.toHaveBeenCalled();
    expect(pagasSelect).not.toHaveBeenCalled();
  });
});

describe('useMarcarDividaPaga', () => {
  it('liquida pelo motorista E pela semana, não a conta corrente toda', async () => {
    const { result } = renderHook(() => useMarcarDividaPaga(), { wrapper });
    result.current.mutate({
      motoristaId: 'm-1',
      periodoInicio: '2026-08-24',
      periodoFim: '2026-08-30',
    });

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    // Sem as datas a RPC dava baixa de semanas que nem estão à vista.
    expect(rpc).toHaveBeenCalledWith('divida_marcar_paga', {
      p_motorista_id: 'm-1',
      p_data_inicio: '2026-08-24',
      p_data_fim: '2026-08-30',
    });
  });

  it('a recusa da BD chega ao utilizador com a causa', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Sem permissão para gerir dívidas.' } });
    const { result } = renderHook(() => useMarcarDividaPaga(), { wrapper });
    result.current.mutate({
      motoristaId: 'm-1',
      periodoInicio: '2026-08-24',
      periodoFim: '2026-08-30',
    });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Sem permissão para gerir dívidas.');
  });
});

describe('useMarcarDividaNaoPaga', () => {
  it('reabre pela liquidação, para só voltarem atrás os movimentos dela', async () => {
    const { result } = renderHook(() => useMarcarDividaNaoPaga(), { wrapper });
    result.current.mutate('d-9');

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('divida_marcar_nao_paga', { p_divida_id: 'd-9' });
  });
});
