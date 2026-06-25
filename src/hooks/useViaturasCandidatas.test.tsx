import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useViaturasCandidatas } from './useViaturasCandidatas';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const rows = [
  { id: 'v1', matricula: 'AA-00-AA', marca: 'Volvo', modelo: 'XC40', ano: 2024, status: 'disponivel', grupo_id: null, is_vendida: false, renting_grupos: null },
  { id: 'v2', matricula: 'BB-11-BB', marca: 'Tesla', modelo: 'Model 3', ano: 2023, status: 'disponivel', grupo_id: 'outro', is_vendida: false, renting_grupos: { nome: 'Económico' } },
  { id: 'v3', matricula: 'CC-22-CC', marca: 'BMW', modelo: 'X1', ano: 2022, status: 'disponivel', grupo_id: 'g1', is_vendida: false, renting_grupos: { nome: 'Este' } },
];

describe('useViaturasCandidatas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exclui viaturas do próprio grupo e deriva grupo_nome', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    (supabase.from as any).mockReturnValue(chain);

    const { result } = renderHook(() => useViaturasCandidatas('g1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.map((v) => v.id)).toEqual(['v1', 'v2']); // v3 pertence a g1 → excluída
    expect(data.find((v) => v.id === 'v2')!.grupo_nome).toBe('Económico');
    expect(data.find((v) => v.id === 'v1')!.grupo_nome).toBeNull();
    expect(supabase.from).toHaveBeenCalledWith('viaturas');
    expect(chain.eq).toHaveBeenCalledWith('is_vendida', false);
  });

  it('não executa sem grupoId', () => {
    const { result } = renderHook(() => useViaturasCandidatas(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
