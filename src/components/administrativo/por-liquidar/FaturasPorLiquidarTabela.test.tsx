import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FaturasPorLiquidarTabela } from './FaturasPorLiquidarTabela';
import { numeroCurto } from '@/utils/numeroDocumento';
import { BarraSelecaoPagamento } from './BarraSelecaoPagamento';
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

describe('numeroCurto', () => {
  it('tira o código interno do tipo de documento', () => {
    expect(numeroCurto('4 67/78')).toBe('67/78');
  });
  it('deixa os outros formatos como estão', () => {
    expect(numeroCurto('FA 2026/50')).toBe('FA 2026/50');
    expect(numeroCurto(null)).toBe('Sem documento fiscal');
  });
});

describe('BarraSelecaoPagamento', () => {
  it('não aparece sem faturas escolhidas', () => {
    const { container } = render(
      <BarraSelecaoPagamento
        quantas={0}
        total={0}
        onLimpar={() => {}}
        onRegistarPagamento={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('mostra quantas e quanto, e abre o pagamento', () => {
    const onRegistar = vi.fn();
    render(
      <BarraSelecaoPagamento
        quantas={2}
        total={30.5}
        onLimpar={() => {}}
        onRegistarPagamento={onRegistar}
      />
    );
    expect(screen.getByText('2 faturas escolhidas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Registar pagamento/ }));
    expect(onRegistar).toHaveBeenCalled();
  });
});
