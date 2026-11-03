import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { CONTAS_VALIDAS_DESDE } from '@/components/motorista-portal/dashboardStats';
import { useMotoristaResumosSemanais } from './useMotoristaResumosSemanais';

/** Query builder falso que regista as chamadas e resolve com as linhas dadas. */
function criarBuilder(linhas: unknown[], chamadas: Array<[string, unknown[]]>) {
  const builder: unknown = new Proxy(
    {},
    {
      get(_alvo, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: { data: unknown[]; error: null }) => void) =>
            resolve({ data: linhas, error: null });
        }
        return (...args: unknown[]) => {
          chamadas.push([prop, args]);
          return builder;
        };
      },
    }
  );
  return builder;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useMotoristaResumosSemanais — corte das contas', () => {
  const chamadas: Array<[string, unknown[]]> = [];

  beforeEach(() => {
    chamadas.length = 0;
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) =>
      criarBuilder(
        tabela === 'motorista_liquido_semanal'
          ? [{ semana_inicio: '2026-10-26', semana_fim: '2026-11-01', liquido: 120 }]
          : [],
        chamadas
      )
    );
  });

  it('só pede ao servidor as semanas desde 26/10', async () => {
    const { result } = renderHook(() => useMotoristaResumosSemanais('m1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(CONTAS_VALIDAS_DESDE).toBe('2026-10-26');
    expect(chamadas).toContainEqual(['gte', ['semana_inicio', CONTAS_VALIDAS_DESDE]]);
    expect(result.current.data?.[0]).toMatchObject({ semanaInicio: '2026-10-26', liquido: 120 });
  });
});
