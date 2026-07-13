import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNotifications, useMarkNotificationRead } from './useNotifications';
import { supabase } from '@/integrations/supabase/client';

// Wrapper para React Query
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// ─── Mocks ─────────────────────────────────────────────────

const mockNotificacoes = [
  {
    id: 'n1',
    org_id: 'org1',
    tipo: 'motorista_pendente',
    titulo: 'Novo motorista pendente',
    mensagem: 'João Silva aguarda aprovação.',
    severidade: 'normal',
    resolvida: false,
    resolvida_por: null,
    resolvida_por_nome: null,
    resolvida_em: null,
    candidatura_id: 'c1',
    destinatario_id: null,
    destinatario_user_id: null,
    evento_id: null,
    viatura_id: null,
    link: null,
    created_at: '2026-07-10T10:00:00Z',
  },
  {
    id: 'n2',
    org_id: 'org1',
    tipo: 'escalonamento',
    titulo: 'Escalonamento urgente',
    mensagem: 'Motorista pendente há 3 dias.',
    severidade: 'urgente',
    resolvida: false,
    resolvida_por: null,
    resolvida_por_nome: null,
    resolvida_em: null,
    candidatura_id: 'c2',
    destinatario_id: null,
    destinatario_user_id: null,
    evento_id: null,
    viatura_id: null,
    link: null,
    created_at: '2026-07-10T09:00:00Z',
  },
  {
    id: 'n3',
    org_id: 'org1',
    tipo: 'motorista_pendente',
    titulo: 'Motorista já resolvido',
    mensagem: 'Resolvido pelo admin.',
    severidade: 'normal',
    resolvida: true,
    resolvida_por: 'u1',
    resolvida_por_nome: 'Admin',
    resolvida_em: '2026-07-10T08:00:00Z',
    candidatura_id: 'c3',
    destinatario_id: null,
    destinatario_user_id: null,
    evento_id: null,
    viatura_id: null,
    link: null,
    created_at: '2026-07-10T07:00:00Z',
  },
];

/**
 * Cria um mock de query chain supabase que imita o encadeamento fluente
 * do PostgREST client. A chain é thenable — o último método chamado determina
 * o valor da promise (útil quando o terminal varia entre .range() e .eq()).
 *
 * Query real:
 *   .from('notificacoes').select('*', { count: 'exact' }).order().range(...)
 *   .eq(...)  ← chamado opcionalmente DEPOIS de .range()
 */
function mockFromChain(resolve: { data: unknown; error: unknown; count: number }) {
  // O próprio chain tem um .then para ser awaitable
  const chain: Record<string, any> = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (onFulfilled: any) => Promise.resolve(resolve).then(onFulfilled),
  };

  (supabase.from as any).mockReturnValue(chain);

  return chain;
}

// ─── Tests: useNotifications ────────────────────────────────

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve listar notificações não resolvidas por omissão', async () => {
    const chain = mockFromChain({
      data: mockNotificacoes.filter((n) => !n.resolvida),
      error: null,
      count: 2,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.data).toHaveLength(2);
    expect(result.current.data?.total).toBe(2);
    expect(result.current.data?.totalPages).toBe(1);

    // Verifica que filtrou resolvida=false
    expect(chain.eq).toHaveBeenCalledWith('resolvida', false);
  });

  it('deve listar todas as notificações quando apenasNaoResolvidas=false', async () => {
    const chain = mockFromChain({
      data: mockNotificacoes,
      error: null,
      count: 3,
    });

    const { result } = renderHook(
      () => useNotifications({ apenasNaoResolvidas: false }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.data).toHaveLength(3);
    expect(result.current.data?.total).toBe(3);

    // Não deve chamar eq('resolvida', false)
    expect(chain.eq).not.toHaveBeenCalled();
  });

  it('deve respeitar page e limit', async () => {
    const chain = mockFromChain({
      data: [mockNotificacoes[0]],
      error: null,
      count: 3,
    });

    renderHook(() => useNotifications({ page: 2, limit: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      // range deve ser chamado com (1, 1) — page 2, limit 1
      expect(chain.range).toHaveBeenCalledWith(1, 1);
    });
  });

  it('não deve executar query quando enabled=false', () => {
    const { result } = renderHook(() => useNotifications({ enabled: false }), {
      wrapper: createWrapper(),
    });

    // isLoading deve ser false porque a query nunca executa
    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('deve propagar erros do Supabase', async () => {
    mockFromChain({
      data: null,
      error: { message: 'Erro de BD', code: 'PGRST116' },
      count: 0,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});

// ─── Tests: useMarkNotificationRead ─────────────────────────

describe('useMarkNotificationRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve chamar resolver_notificacao RPC com o id correcto', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    (supabase.rpc as any).mockImplementation(rpc);

    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: createWrapper(),
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
      wrapper: createWrapper(),
    });

    result.current.mutate('n1');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
