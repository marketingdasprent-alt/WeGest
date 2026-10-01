import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useResumoPlataformas } from './useResumoPlataformas';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(() => Promise.resolve({ data: [], error: null })) },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useOrgId: () => 'org-1',
}));

describe('useResumoPlataformas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pede o resumo uma só vez para o mesmo dia, ainda que a Date mude a cada render', async () => {
    // O ecrã do Financeiro cria `new Date()` em cada render. Enquanto o efeito
    // dependia de getTime(), cada render trazia um instante novo, o efeito
    // corria outra vez, chamava setState — e o ciclo repetia-se sem fim (foram
    // 511 pedidos num ecrã que ficou preso no skeleton).
    const { rerender } = renderHook(
      ({ inicio, fim }: { inicio: Date; fim: Date }) => useResumoPlataformas(inicio, fim),
      {
        initialProps: {
          inicio: new Date('2026-09-04T09:00:00.000Z'),
          fim: new Date('2026-09-04T09:00:00.000Z'),
        },
      }
    );

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));

    // Mesmo dia, instante diferente — como acontece a cada render real.
    rerender({
      inicio: new Date('2026-09-04T09:00:00.123Z'),
      fim: new Date('2026-09-04T09:00:00.456Z'),
    });
    // Ainda o mesmo dia local (o fuso conta: um instante em UTC perto da
    // meia-noite já pertence ao dia seguinte em Lisboa).
    rerender({
      inicio: new Date('2026-09-04T14:30:12.500Z'),
      fim: new Date('2026-09-04T14:30:12.500Z'),
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('volta a pedir quando o dia muda', async () => {
    const { rerender } = renderHook(
      ({ inicio, fim }: { inicio: Date; fim: Date }) => useResumoPlataformas(inicio, fim),
      {
        initialProps: {
          inicio: new Date('2026-09-04T09:00:00Z'),
          fim: new Date('2026-09-04T09:00:00Z'),
        },
      }
    );
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));

    rerender({ inicio: new Date('2026-09-05T09:00:00Z'), fim: new Date('2026-09-05T09:00:00Z') });

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(2));
  });
});
