import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMotoristas } from './useMotoristas';
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
});
