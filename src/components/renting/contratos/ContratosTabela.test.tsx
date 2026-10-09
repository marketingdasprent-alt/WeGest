// Arrastar para copiar o nome do condutor acaba num clique na linha, e esse
// clique abria o contrato — não se conseguia copiar nada da lista.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ContratoRenting } from '@/types/contratoRenting';

vi.mock('@/hooks/useEventosPendentesRenting', () => ({
  useEventosPendentesRenting: () => ({ data: [] }),
}));

import { ContratosTabela } from './ContratosTabela';

const contrato = {
  id: 'c-956',
  codigo: 956,
  versao: 1,
  matricula: 'BJ-50-GL',
  grupo: 'Citadino Pequeno',
  data_inicio: '2026-10-09T10:00:00Z',
  data_fim: null,
  estado_operacional: 'agendado',
  estado_financeiro: 'pendente',
  cliente_id: 'cli-1',
  estacao_entrega_id: null,
  regime: 'tvde',
} as unknown as ContratoRenting;

function renderTabela(onRowClick = vi.fn()) {
  render(
    <ContratosTabela
      contratos={[contrato]}
      isLoading={false}
      totalSemFiltros={1}
      sortColumn="codigo"
      sortDir="asc"
      onSort={vi.fn()}
      onRowClick={onRowClick}
      getClienteNome={() => 'Década Ousada, Lda.'}
      getEstacaoNome={() => 'Leiria'}
      getCondutorNome={() => 'Dídimo Fernandes'}
    />
  );
  return onRowClick;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
});

describe('ContratosTabela — clique na linha', () => {
  it('um clique simples abre o contrato', () => {
    const onRowClick = renderTabela();
    fireEvent.click(screen.getByText('Dídimo Fernandes'));
    expect(onRowClick).toHaveBeenCalledWith(contrato);
  });

  it('com o nome do condutor selecionado, o clique não abre o contrato', () => {
    const onRowClick = renderTabela();
    const celula = screen.getByText('Dídimo Fernandes');
    const range = document.createRange();
    range.selectNodeContents(celula);
    window.getSelection()?.addRange(range);

    fireEvent.click(celula);

    expect(onRowClick).not.toHaveBeenCalled();
  });
});
