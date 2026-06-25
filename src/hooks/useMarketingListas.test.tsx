import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarketingListas } from './useMarketingListas';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const listas = [
  { id: '1', nome: 'Motoristas Ativos', origem: 'motoristas_ativos' },
  { id: '2', nome: 'Newsletter', origem: 'manual' },
];

describe('useMarketingListas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devolve as listas ordenadas por nome', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: listas, error: null }),
    };
    (supabase.from as any).mockReturnValue(chain);

    const { result } = renderHook(() => useMarketingListas(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(listas);
    expect(supabase.from).toHaveBeenCalledWith('marketing_listas');
    expect(chain.order).toHaveBeenCalledWith('nome');
  });

  it('não executa quando disabled', () => {
    const { result } = renderHook(() => useMarketingListas(false), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
