import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const reservasRows = [{ id: 'r1' }];
const cobrancasRows = [
  {
    id: 'c1',
    periodo_de: '2026-07-01',
    periodo_ate: '2026-07-31',
    descricao: 'Slot — Julho 2026',
    valor_total: 400,
    valor_sem_iva: 325.2,
    taxa_iva: 23,
    estado: 'pendente',
    emite_fatura_fiscal: true,
    documento_externo_ref: null,
    destinatario_id: 'cli1',
    destinatario_nome: 'João',
    reserva_id: 'r1',
  },
];

vi.mock('@/integrations/supabase/client', () => {
  const build = (rows: unknown[]) => {
    const thenable: any = {
      select: () => thenable,
      eq: () => thenable,
      in: () => thenable,
      order: () => thenable,
      then: (res: (v: { data: unknown[]; error: null }) => void) =>
        res({ data: rows, error: null }),
    };
    return thenable;
  };
  return {
    supabase: {
      from: (table: string) => build(table === 'reservas' ? reservasRows : cobrancasRows),
    },
  };
});

import { useSlotCobrancasMensais } from './useSlotCobrancasMensais';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useSlotCobrancasMensais', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devolve as cobranças slot do motorista', async () => {
    const { result } = renderHook(() => useSlotCobrancasMensais('mot1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].estado).toBe('pendente');
  });

  it('não corre sem motoristaId', () => {
    const { result } = renderHook(() => useSlotCobrancasMensais(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
