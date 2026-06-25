import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMotoristasAudiencia } from './useMotoristasAudiencia';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const membros = [
  { id: '1', nome: 'João Silva', email: 'joao@example.com' },
  { id: '2', nome: 'Maria Santos', email: 'maria@example.com' },
];

describe('useMotoristasAudiencia', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aplica o critério de membro e devolve nome+email', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: membros, error: null }),
    };
    (supabase.from as any).mockReturnValue(chain);

    const { result } = renderHook(() => useMotoristasAudiencia(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(membros);
    expect(supabase.from).toHaveBeenCalledWith('motoristas_ativos');
    expect(chain.eq).toHaveBeenCalledWith('status_ativo', true);
    expect(chain.neq).toHaveBeenCalledWith('email', '');
  });
});
