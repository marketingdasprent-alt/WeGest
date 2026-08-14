import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useMotoristas,
  useCreateMotorista,
  useUpdateMotorista,
  useDeleteMotorista,
} from './useMotoristas';
import { supabase } from '@/integrations/supabase/client';

// Mock do useToast — evita depender do contexto Radix
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

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

// Dados de teste
const mockMotoristas = [
  {
    id: '1',
    nome: 'João Silva',
    status_ativo: true,
    is_slot: false,
    slot_valor_semanal: null,
  },
  {
    id: '2',
    nome: 'Maria Santos',
    status_ativo: true,
    is_slot: true,
    slot_valor_semanal: 100,
  },
  {
    id: '3',
    nome: 'Pedro Costa',
    status_ativo: false,
    is_slot: false,
    slot_valor_semanal: null,
  },
];

describe('useMotoristas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar lista de motoristas', async () => {
    // Setup mock
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };

    (supabase.from as any).mockReturnValue(mockQuery);

    // Mock do então para retornar data
    mockQuery.select = vi.fn().mockReturnValue({
      ...mockQuery,
      order: vi.fn().mockResolvedValue({ data: mockMotoristas, error: null }),
    });

    // Renderizar hook
    const { result } = renderHook(() => useMotoristas(), {
      wrapper: createWrapper(),
    });

    // Esperar pelo carregamento
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verificar resultado
    expect(result.current.data).toBeDefined();
    expect(Array.isArray(result.current.data)).toBe(true);
  });

  it('não deve executar query quando disabled', () => {
    const { result } = renderHook(() => useMotoristas({ enabled: false }), {
      wrapper: createWrapper(),
    });

    // Query não deve ter sucesso quando desabilitada
    expect(result.current.isLoading).toBe(false);
  });

  it('deve manter comportamento inicial consistente entre instâncias', () => {
    const wrapper = createWrapper();
    const { result: result1 } = renderHook(() => useMotoristas(), { wrapper });
    const { result: result2 } = renderHook(() => useMotoristas(), { wrapper });

    // Com o mesmo QueryClient, ambas as instâncias partilham cache (mesma queryKey)
    // e devem ter exactamente o mesmo status inicial.
    expect(result1.current.status).toEqual(result2.current.status);
    expect(result1.current.isLoading).toEqual(result2.current.isLoading);
  });

  // ── Cenário: lista vazia (empty state) ──────────────────────

  it('deve retornar array vazio quando não há motoristas (empty state)', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };

    (supabase.from as any).mockReturnValue(mockQuery);

    const { result } = renderHook(() => useMotoristas(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.data?.length).toBe(0);
  });
});

// ── Mutations: flow criar/gravar/reload/verificar ─────────────

describe('useCreateMotorista', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria motorista com sucesso e invalida queryKey ["motoristas"]', async () => {
    const novoMotorista = {
      id: '99',
      nome: 'Ana Lopes',
      nif: '123456789',
      email: 'ana@example.com',
    };

    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: novoMotorista, error: null }),
    };
    (supabase.from as any).mockReturnValue(chain);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateMotorista(), { wrapper });

    result.current.mutate({
      nome: 'Ana Lopes',
      nif: '123456789',
      email: 'ana@example.com',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verifica chamada ao supabase
    expect(supabase.from).toHaveBeenCalledWith('motoristas_ativos');
    expect(chain.insert).toHaveBeenCalledWith({
      nome: 'Ana Lopes',
      nif: '123456789',
      email: 'ana@example.com',
    });

    // Verifica invalidação da queryKey
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['motoristas'] });

    // Verifica toast de sucesso
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Motorista criado' }));

    // Verifica dados retornados
    expect(result.current.data).toEqual(novoMotorista);
  });

  it('propaga erro quando NIF duplicado (constraint violation)', async () => {
    const dbError = new Error(
      'duplicate key value violates unique constraint "motoristas_nif_key"'
    );

    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
    };
    (supabase.from as any).mockReturnValue(chain);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateMotorista(), { wrapper });

    result.current.mutate({ nome: 'Duplicado', nif: '999999999' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // O erro deve ser propagado
    expect(result.current.error).toBe(dbError);

    // Toast de erro deve ter sido chamado com variant destructive
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro',
        variant: 'destructive',
      })
    );
  });
});

// ── useUpdateMotorista ───────────────────────────────────────

describe('useUpdateMotorista', () => {
  beforeEach(() => vi.clearAllMocks());

  it('actualiza motorista e persiste dados correctamente', async () => {
    const motoristaActualizado = {
      id: '1',
      nome: 'João Silva Actualizado',
      nif: '987654321',
      email: 'joao.novo@example.com',
    };

    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: motoristaActualizado, error: null }),
    };
    (supabase.from as any).mockReturnValue(chain);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateMotorista(), { wrapper });

    const dadosUpdate = { nome: 'João Silva Actualizado', nif: '987654321' };
    result.current.mutate({ id: '1', dados: dadosUpdate });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verifica chamadas ao supabase
    expect(supabase.from).toHaveBeenCalledWith('motoristas_ativos');
    expect(chain.update).toHaveBeenCalledWith(dadosUpdate);
    expect(chain.eq).toHaveBeenCalledWith('id', '1');

    // Verifica invalidação
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['motoristas'] });

    // Verifica dados persistidos
    expect(result.current.data).toEqual(motoristaActualizado);

    // Toast de sucesso
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Motorista actualizado' }));
  });
});

// ── useDeleteMotorista ────────────────────────────────────────

describe('useDeleteMotorista', () => {
  beforeEach(() => vi.clearAllMocks());

  it('elimina motorista e invalida a lista', async () => {
    const chain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabase.from as any).mockReturnValue(chain);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDeleteMotorista(), { wrapper });

    result.current.mutate('1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verifica chamadas ao supabase
    expect(supabase.from).toHaveBeenCalledWith('motoristas_ativos');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', '1');

    // Verifica invalidação — motorista removido da lista após reload
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['motoristas'] });

    // Toast de sucesso
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Motorista eliminado' }));
  });
});
