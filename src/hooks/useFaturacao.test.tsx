import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const emitir = vi.fn();
vi.mock('@/lib/faturacao', () => ({
  emitirDocumento: (...a: unknown[]) => emitir(...a),
  checkFaturacaoHealth: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
import { useEmitirEEscreverFatura } from './useFaturacao';

function montar() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidar = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useEmitirEEscreverFatura(), { wrapper });
  return { result, invalidar };
}

const input = {
  payload: { tipo: 'FT' as const, cliente: { nome: 'X' }, itens: [] },
  cobrancaId: 'cob-1',
  contratoId: 'ctr-1',
};

beforeEach(() => {
  emitir.mockReset();
});

describe('useEmitirEEscreverFatura', () => {
  it('uma recusa invalida as opções de fornecedor (disponibilidade e última usada)', async () => {
    emitir.mockRejectedValue(new Error('O agente Primavera não respondeu'));
    const { result, invalidar } = montar();
    await expect(result.current.mutateAsync(input)).rejects.toThrow('não respondeu');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['faturacao-opcoes'] });
  });

  it('uma emissão bem-sucedida também as invalida', async () => {
    emitir.mockResolvedValue({ success: true });
    const { result, invalidar } = montar();
    await result.current.mutateAsync(input);
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['faturacao-opcoes'] });
  });
});
