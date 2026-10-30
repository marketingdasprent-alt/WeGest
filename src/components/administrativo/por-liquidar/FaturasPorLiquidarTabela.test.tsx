import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FaturasPorLiquidarTabela } from './FaturasPorLiquidarTabela';
import { PorLiquidarToolbar } from './PorLiquidarToolbar';
import { numeroCurto } from '@/utils/numeroDocumento';
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

const renderTabela = (extra: Partial<React.ComponentProps<typeof FaturasPorLiquidarTabela>> = {}) =>
  render(
    <FaturasPorLiquidarTabela
      grupos={grupos}
      selecionadas={new Set()}
      onToggleFatura={() => {}}
      onToggleCliente={() => {}}
      onVerPdf={() => {}}
      pdfAAbrir={null}
      {...extra}
    />
  );

describe('FaturasPorLiquidarTabela', () => {
  it('fecha cada cliente com a linha de total, como o mapa do KeyInvoice', () => {
    renderTabela();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.queryByText('Total Ana')).toBeNull();
    expect(screen.getByText('67/94')).toBeTruthy();
  });

  it('com só algumas faturas escolhidas, o cliente não aparece marcado', () => {
    renderTabela({ selecionadas: new Set(['a']) });
    const caixa = screen.getByRole('checkbox', { name: 'Escolher todas as faturas de Ana' });
    expect(caixa.getAttribute('data-state')).toBe('unchecked');
    expect(screen.getByText(/1 escolhida/)).toBeTruthy();
  });

  it('a caixa do cliente escolhe as faturas todas dele', () => {
    const onToggleCliente = vi.fn();
    renderTabela({ onToggleCliente });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Escolher todas as faturas de Ana' }));
    expect(onToggleCliente).toHaveBeenCalledWith(grupos[0]);
  });

  it('PDF só nas faturas com documento fiscal, e abre a fatura certa', () => {
    const onVerPdf = vi.fn();
    renderTabela({ onVerPdf });

    const botoes = screen.getAllByRole('button', { name: /Ver PDF/ });
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]);
    expect(onVerPdf).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('abrir o PDF não marca a fatura', () => {
    const onToggleFatura = vi.fn();
    renderTabela({ onToggleFatura });
    fireEvent.click(screen.getByRole('button', { name: /Ver PDF/ }));
    expect(onToggleFatura).not.toHaveBeenCalled();
  });

  it('clicar na linha escolhe a fatura', () => {
    const onToggleFatura = vi.fn();
    renderTabela({ onToggleFatura });
    fireEvent.click(screen.getByText('67/94'));
    expect(onToggleFatura).toHaveBeenCalledWith('a');
  });

  it('enquanto o PDF abre, o botão fica bloqueado para não abrir duas janelas', () => {
    renderTabela({ pdfAAbrir: 'a' });
    expect(
      (screen.getByRole('button', { name: 'Ver PDF de 4 67/94' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('sem faturas mostra a linha de vazio', () => {
    renderTabela({ grupos: [] });
    expect(screen.getByText('Sem faturas por liquidar para os filtros selecionados.')).toBeTruthy();
  });
});

describe('PorLiquidarToolbar', () => {
  const renderToolbar = (de: string, ate: string) =>
    render(
      <PorLiquidarToolbar
        de={de}
        ate={ate}
        onPeriodoChange={() => {}}
        pesquisa=""
        onPesquisaChange={() => {}}
        totalCount={83}
      />
    );

  it('com um atalho, as datas ficam escondidas e mostra o contador', () => {
    renderToolbar('', '');
    expect(screen.queryByLabelText('De')).toBeNull();
    expect(screen.getByText('83 faturas')).toBeTruthy();
  });

  it('com datas à mão, mostra-as para se poderem mudar', () => {
    renderToolbar('2026-10-05', '2026-10-20');
    expect(screen.getByLabelText('De')).toBeTruthy();
    expect(screen.getByLabelText('Até')).toBeTruthy();
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
