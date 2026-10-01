import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { differenceInCalendarDays, parseISO } from 'date-fns';

import {
  NovoMovimentoFinanceiroOverlay,
  type MovimentoFinanceiro,
} from './NovoMovimentoFinanceiroOverlay';

const insertMock = vi.fn();
const eqMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: insertMock, delete: () => ({ eq: eqMock }) }),
    storage: { from: vi.fn() },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const REPARACAO: MovimentoFinanceiro = {
  id: 'rep-1',
  tipo: 'debito',
  categoria: 'reparacao',
  descricao: 'Para brisas BO-29-DG',
  valor: 1237.62,
  data_movimento: '2026-09-17',
  data_pagamento: null,
  status: 'pendente',
  referencia: null,
  created_at: '2026-09-17T10:00:00Z',
};

const abrirAcordo = () =>
  render(
    <NovoMovimentoFinanceiroOverlay
      motoristaId="mot-1"
      reparacaoPendente={REPARACAO}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />
  );
const nSemanas = () => screen.getByLabelText('Nº de Semanas / Parcelas');
const botao = (nome: string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement;

describe('NovoMovimentoFinanceiroOverlay — Definir Acordo', () => {
  beforeEach(() => {
    insertMock.mockReset().mockResolvedValue({ error: null });
    eqMock.mockReset().mockResolvedValue({ error: null });
  });

  it('não assume 1 semana: sem o nº de semanas não se confirma', () => {
    abrirAcordo();
    expect((nSemanas() as HTMLInputElement).value).toBe('');
    expect(botao('Confirmar Acordo').disabled).toBe(true);
  });

  it('com 1 semana avisa que o valor todo sai de uma vez', () => {
    abrirAcordo();
    fireEvent.change(nSemanas(), { target: { value: '1' } });
    expect(screen.getByRole('note').textContent).toContain('1237.62');
    expect(botao('Confirmar Acordo').disabled).toBe(false);
  });

  it('grava uma parcela por semana, sem aviso', async () => {
    abrirAcordo();
    fireEvent.change(nSemanas(), { target: { value: '3' } });
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(botao('Criar 3 Parcelas'));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const parcelas = insertMock.mock.calls[0][0] as { descricao: string; data_movimento: string }[];
    expect(parcelas.map((p) => p.descricao)).toEqual([
      'Acordo de pagamento: Para brisas BO-29-DG (1/3)',
      'Acordo de pagamento: Para brisas BO-29-DG (2/3)',
      'Acordo de pagamento: Para brisas BO-29-DG (3/3)',
    ]);
    const datas = parcelas.map((p) => parseISO(p.data_movimento));
    expect(differenceInCalendarDays(datas[1], datas[0])).toBe(7);
    expect(differenceInCalendarDays(datas[2], datas[1])).toBe(7);
  });
});
