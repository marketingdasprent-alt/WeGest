import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useRenovarContrato } from './useContratosRenting';

// A renovação segue a regra do fecho (acordado, tarifa, modelo) e mantém um
// valor manual legado como preço, para não bloquear contratos antigos.
const { tabelas, rpc } = vi.hoisted(() => ({
  tabelas: {} as Record<string, unknown>,
  rpc: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (tabela: string) => {
      const resultado = { data: tabelas[tabela] ?? null, error: null };
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.single = () => Promise.resolve(resultado);
      c.maybeSingle = () => Promise.resolve(resultado);
      return c;
    },
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

function contrato(over: Record<string, unknown> = {}) {
  return {
    regime: 'tvde',
    preco_semana_acordado: null,
    valor_total_manual: null,
    tarifa_id: 't1',
    viaturas: { modelo_id: 'm1' },
    renting_tarifas: { preco_semana: null },
    ...over,
  };
}

async function renovar(): Promise<string | null> {
  const { result } = renderHook(() => useRenovarContrato(), { wrapper });
  let erro: string | null = null;
  await act(async () => {
    try {
      await result.current.mutateAsync({ contratoId: 'c1' });
    } catch (e) {
      erro = (e as Error).message;
    }
  });
  return erro;
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 'novo', error: null });
  tabelas.renting_tarifa_precos_modelo = null;
});

describe('renovar contrato TVDE: preço', () => {
  it('tarifa só com preço geral (sem linha de modelo) já não bloqueia', async () => {
    tabelas.contratos_renting = contrato({ renting_tarifas: { preco_semana: 225 } });
    expect(await renovar()).toBeNull();
    expect(rpc).toHaveBeenCalled();
  });

  it('valor manual legado continua a contar como preço', async () => {
    tabelas.contratos_renting = contrato({ valor_total_manual: 300 });
    expect(await renovar()).toBeNull();
    expect(rpc).toHaveBeenCalled();
  });

  it('sem nenhum preço, recusa', async () => {
    tabelas.contratos_renting = contrato();
    expect(await renovar()).toMatch(/não tem preço/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
