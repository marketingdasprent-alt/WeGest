import { vi } from 'vitest';

/**
 * Mock Supabase Query Builder para testes.
 * Simula as chamadas mais comuns: select(), eq(), from(), order(), etc.
 */
export function createMockSupabaseQuery<T = any>(data: T | null = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

export function createMockSupabaseFrom() {
  return {
    from: vi.fn().mockReturnValue(createMockSupabaseQuery()),
  };
}

/**
 * Exemplo: mock Supabase que retorna motoristas
 */
export function mockMotoristasFetch(motoristas: any[] = []) {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn().mockReturnValue({
      ...queryBuilder,
      then: vi.fn().mockResolvedValue({ data: motoristas, error: null }),
    }),
  };
}
