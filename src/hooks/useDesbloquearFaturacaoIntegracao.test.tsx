import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { rpc, toast } = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { useDesbloquearFaturacaoIntegracao } from './useDesbloquearFaturacaoIntegracao';

function setup() {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => useDesbloquearFaturacaoIntegracao(), { wrapper }) };
}

describe('useDesbloquearFaturacaoIntegracao', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama a RPC com o id, invalida a integração e avisa do sucesso', async () => {
    rpc.mockResolvedValue({ error: null });
    const { result, invalidate } = setup();
    result.current.mutate('int-1');

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Faturação desbloqueada' }));
    expect(rpc).toHaveBeenCalledWith('desbloquear_faturacao_integracao', {
      p_integracao_id: 'int-1',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['faturacao-opcoes'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['plataformas_configuracao'] });
  });

  it('erro da RPC mostra o motivo real num toast destructive', async () => {
    rpc.mockResolvedValue({ error: { message: 'sem permissão' } });
    const { result, invalidate } = setup();
    result.current.mutate('int-1');

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'sem permissão', variant: 'destructive' })
      )
    );
    expect(invalidate).not.toHaveBeenCalled();
  });
});
