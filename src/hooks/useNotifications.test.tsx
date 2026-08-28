import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarkNotificationRead } from './useNotifications';
import { supabase } from '@/integrations/supabase/client';

/**
 * Este ficheiro testava também `useNotifications`, um hook de leitura paginada
 * que nunca teve consumidor — removido a 31/07/2026 junto com os seus 5 testes
 * e o `mockFromChain` que só eles usavam. A leitura viva é o
 * `useNotificacoesHistorico`, e é lá que essa cobertura pertence.
 */

// Wrapper para React Query. Devolve também o queryClient para se poder observar
// as invalidações — ver o último teste.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

// ─── Tests: useMarkNotificationRead ─────────────────────────

describe('useMarkNotificationRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve chamar resolver_notificacao RPC com o id correcto', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    (supabase.rpc as any).mockImplementation(rpc);

    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: createWrapper().wrapper,
    });

    result.current.mutate('n1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('resolver_notificacao', {
      p_id: 'n1',
    });
  });

  it('deve lidar com erro na RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error('RPC error') });
    (supabase.rpc as any).mockImplementation(rpc);

    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: createWrapper().wrapper,
    });

    result.current.mutate('n1');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  /**
   * A lista viva (`useNotificacoesHistorico`) regista-se em
   * `['notificacoes', 'infinite', { … }]`. Esta mutação só a invalida porque o
   * React Query faz correspondência por prefixo com `['notificacoes']`.
   *
   * Se alguém estreitar a chave — por exemplo para `['notificacoes','mutation']`
   * — a resolução deixa de refrescar a lista e a notificação já resolvida
   * continua no sino, sem erro nenhum a assinalá-lo. Este teste é a única coisa
   * que trava essa alteração.
   */
  it('invalida com a chave-prefixo que alcança a lista viva', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    (supabase.rpc as any).mockImplementation(rpc);

    const { wrapper, queryClient } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });

    result.current.mutate('n1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notificacoes'] });
  });
});
