import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SeletorFornecedorFaturacao } from './SeletorFornecedorFaturacao';
import type { OpcaoFornecedor } from '@/types/faturacao';

const opcoes: OpcaoFornecedor[] = [
  {
    integracao_id: 'ki',
    provider: 'keyinvoice',
    label: 'KeyInvoice',
    disponivel: true,
    ultima_usada: false,
  },
  {
    integracao_id: null,
    provider: 'primavera',
    label: 'Primavera',
    disponivel: false,
    motivo: 'Não configurado para esta empresa',
    ultima_usada: false,
  },
];

describe('SeletorFornecedorFaturacao', () => {
  it('a carregar', () => {
    render(
      <SeletorFornecedorFaturacao
        opcoes={[]}
        isLoading
        error={null}
        integracaoId={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/a carregar fornecedores/i)).toBeInTheDocument();
  });

  it('erro', () => {
    render(
      <SeletorFornecedorFaturacao
        opcoes={[]}
        isLoading={false}
        error={new Error('rede')}
        integracaoId={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/rede/)).toBeInTheDocument();
  });

  it('nenhum disponível: avisa que o documento fiscal não sai', () => {
    render(
      <SeletorFornecedorFaturacao
        opcoes={opcoes.map((o) => ({ ...o, disponivel: false }))}
        isLoading={false}
        error={null}
        integracaoId={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/não tem faturação configurada/i)).toBeInTheDocument();
  });

  it('o indisponível aparece desativado com o motivo', () => {
    render(
      <SeletorFornecedorFaturacao
        opcoes={opcoes}
        isLoading={false}
        error={null}
        integracaoId="ki"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /primavera/i })).toBeDisabled();
    expect(screen.getByText('Não configurado para esta empresa')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /keyinvoice/i })).toBeChecked();
  });

  it('escolher chama onChange com o id', () => {
    const onChange = vi.fn();
    const duas = [
      opcoes[0],
      { ...opcoes[1], integracao_id: 'pv', disponivel: true, motivo: undefined },
    ];
    render(
      <SeletorFornecedorFaturacao
        opcoes={duas}
        isLoading={false}
        error={null}
        integracaoId={null}
        onChange={onChange}
      />
    );
    expect(screen.getByText(/escolha por qual/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /primavera/i }));
    expect(onChange).toHaveBeenCalledWith('pv');
  });
});
