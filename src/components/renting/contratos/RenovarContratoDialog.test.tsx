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

// data_fim de legado DIFERENTE do prazo, para distinguir as bases de cálculo:
// rent-a-car conta da data_fim, TVDE conta do prazo (proxima_renovacao_em).
const contrato = {
  id: 'c-821',
  codigo: 821,
  regime: 'tvde',
  viatura_id: null,
  data_inicio: '2026-08-25T20:24:00',
  data_fim: '2026-09-10T20:24:00',
  proxima_renovacao_em: '2026-09-22T20:24:00',
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

const botaoRenovar = () => screen.getByRole('button', { name: /^Renovar$/ });

describe('RenovarContratoDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T15:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TVDE em atraso: a próxima segue o ciclo do prazo, não conta a partir de hoje', () => {
    renderDialog(contrato);
    expect(screen.getByText('Renovação prevista')).toBeInTheDocument();
    expect(screen.getByText('22/09/2026')).toBeInTheDocument();
    expect(screen.getByText('(em atraso)')).toBeInTheDocument();
    expect(screen.getByText('Próxima renovação')).toBeInTheDocument();
    // Prazo 22/09 + 30 dias; contar de hoje daria 24/10.
    expect(screen.getByText('22/10/2026')).toBeInTheDocument();
    expect(screen.queryByText('24/10/2026')).not.toBeInTheDocument();
    expect(screen.queryByText(/abre um novo mês/)).not.toBeInTheDocument();
    expect(screen.getByText(/fica no histórico como versão/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('TVDE dentro da janela (antes do prazo): conta do prazo e deixa renovar', () => {
    renderDialog({ ...contrato, proxima_renovacao_em: '2026-09-30T10:00:00' } as ContratoRenting);
    expect(screen.getByText('30/09/2026')).toBeInTheDocument();
    expect(screen.getByText('30/10/2026')).toBeInTheDocument();
    expect(screen.queryByText('(em atraso)')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('TVDE fora da janela: avisa quando pode renovar e bloqueia o botão', () => {
    renderDialog({ ...contrato, proxima_renovacao_em: '2026-10-22T20:24:00' } as ContratoRenting);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Próxima renovação só a 22/10/2026 — pode renovar a partir de 15/10/2026.'
    );
    expect(botaoRenovar()).toBeDisabled();
  });

  it('rent-a-car: o novo período continua a partir da data_fim', () => {
    renderDialog({ ...contrato, regime: 'rent_a_car' } as ContratoRenting);
    expect(screen.getByText('Novo período')).toBeInTheDocument();
    expect(screen.getByText('10/09/2026 → 10/10/2026')).toBeInTheDocument();
    expect(screen.getByText(/abre um novo mês/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
