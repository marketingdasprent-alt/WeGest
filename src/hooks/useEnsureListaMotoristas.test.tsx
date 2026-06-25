import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEnsureListaMotoristas } from './useEnsureListaMotoristas';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useEnsureListaMotoristas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama a RPC e devolve a lista de sistema', async () => {
    const lista = { id: 'sys-1', nome: 'Motoristas Ativos', origem: 'motoristas_ativos' };
    (supabase.rpc as any).mockResolvedValue({ data: lista, error: null });

    const { result } = renderHook(() => useEnsureListaMotoristas(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(lista);
    expect(supabase.rpc).toHaveBeenCalledWith('ensure_lista_motoristas');
  });
});
