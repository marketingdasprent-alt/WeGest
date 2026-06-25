import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAssociarViaturaGrupo } from './useAssociarViaturaGrupo';
import { supabase } from '@/integrations/supabase/client';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, spy };
}

describe('useAssociarViaturaGrupo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('associa: update grupo_id e invalida as queries', async () => {
    const chain: any = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabase.from as any).mockReturnValue(chain);
    const { wrapper, spy } = makeWrapper();

    const { result } = renderHook(() => useAssociarViaturaGrupo('g1'), { wrapper });
    result.current.mutate({ viaturaId: 'v1', novoGrupoId: 'g1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('viaturas');
    expect(chain.update).toHaveBeenCalledWith({ grupo_id: 'g1' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'v1');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['viaturas_grupo', 'g1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['viaturas_candidatas', 'g1'] });
    expect(toast).toHaveBeenCalled();
  });

  it('remove: update grupo_id = null', async () => {
    const chain: any = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabase.from as any).mockReturnValue(chain);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useAssociarViaturaGrupo('g1'), { wrapper });
    result.current.mutate({ viaturaId: 'v9', novoGrupoId: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chain.update).toHaveBeenCalledWith({ grupo_id: null });
  });
});
