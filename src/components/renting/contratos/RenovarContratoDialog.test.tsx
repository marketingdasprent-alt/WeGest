import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ContratoRenting } from '@/types/contratoRenting';

// ── Mocks (hoisted) ──────────────────────────────────────────────────────────

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'maybeSingle']) chain[m] = vi.fn(() => chain);
  (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
  return { supabase: { from: vi.fn(() => chain) } };
});

vi.mock('@/hooks/useContratosRenting', () => ({
  useRenovarContrato: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { RenovarContratoDialog } from './RenovarContratoDialog';

// data_fim de legado DIFERENTE de hoje, para distinguir as duas bases de
// cálculo: a antiga (data_fim) e a da RPC em TVDE (now()).
const contrato = {
  id: 'c-821',
  codigo: 821,
  regime: 'tvde',
  viatura_id: null,
  data_inicio: '2026-08-25T20:24:00Z',
  data_fim: '2026-09-10T20:24:00Z',
  proxima_renovacao_em: null,
  renovacao_opcao: 'intervalo_dias',
  renovacao_intervalo_dias: 30,
  km_saida: 130500,
  kms_incluidos: null,
  km_adicional_valor: null,
  estado_financeiro: 'pendente',
} as unknown as ContratoRenting;

function renderDialog(c: ContratoRenting) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RenovarContratoDialog open onOpenChange={() => {}} contrato={c} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RenovarContratoDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T15:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TVDE: a próxima renovação conta a partir de hoje, não da data_fim de legado', () => {
    renderDialog(contrato);
    expect(screen.getByText('Próxima renovação')).toBeInTheDocument();
    expect(screen.getByText('24/09/2026 → 24/10/2026')).toBeInTheDocument();
    expect(screen.queryByText(/abre um novo mês/)).not.toBeInTheDocument();
    expect(screen.getByText(/O contrato e a data de início mantêm-se/)).toBeInTheDocument();
  });

  it('rent-a-car: o novo período continua a partir da data_fim', () => {
    renderDialog({ ...contrato, regime: 'rent_a_car' } as ContratoRenting);
    expect(screen.getByText('Novo período')).toBeInTheDocument();
    expect(screen.getByText('10/09/2026 → 10/10/2026')).toBeInTheDocument();
    expect(screen.getByText(/abre um novo mês/)).toBeInTheDocument();
  });
});
