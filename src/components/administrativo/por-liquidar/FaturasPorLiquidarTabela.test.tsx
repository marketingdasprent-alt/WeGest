import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FaturasPorLiquidarTabela } from './FaturasPorLiquidarTabela';
import type { ClienteComFaturas, FaturaPorLiquidar } from '@/hooks/useFaturasPorLiquidar';

const fatura = (id: string, ref: string | null): FaturaPorLiquidar => ({
  id,
  descricao: null,
  saldoPagar: 10,
  destinatario_id: 'cli',
  destinatario_nome: 'Ana',
  contrato_id: null,
  documento_externo_ref: ref,
  valorTotal: 10,
  pago: 0,
  creditado: 0,
  emitidaEm: '2026-10-20T00:00:00Z',
});

const grupos: ClienteComFaturas[] = [
  {
    clienteId: 'cli',
    clienteNome: 'Ana',
    totalPendente: 20,
    faturas: [fatura('a', '4 67/94'), fatura('b', null)],
  },
];

const renderTabela = (extra: { pdfAAbrir?: string | null; onVerPdf?: () => void } = {}) =>
  render(
    <FaturasPorLiquidarTabela
      grupos={grupos}
      selecionadas={new Set()}
      onToggleFatura={() => {}}
      onToggleCliente={() => {}}
      onVerPdf={extra.onVerPdf ?? (() => {})}
      pdfAAbrir={extra.pdfAAbrir ?? null}
    />
  );

describe('FaturasPorLiquidarTabela', () => {
  it('PDF só nas faturas com documento fiscal, e abre a fatura certa', () => {
    const onVerPdf = vi.fn();
    renderTabela({ onVerPdf });

    const botoes = screen.getAllByRole('button', { name: /Ver PDF/ });
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]);
    expect(onVerPdf).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('enquanto o PDF abre, o botão fica bloqueado para não abrir duas janelas', () => {
    renderTabela({ pdfAAbrir: 'a' });
    expect(
      (screen.getByRole('button', { name: 'Ver PDF de 4 67/94' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
