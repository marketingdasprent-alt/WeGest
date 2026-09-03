import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const {
  useDividasMotorista,
  useMarcarDividaPaga,
  useMarcarDividaNaoPaga,
  marcarPaga,
  marcarNaoPaga,
  hasAccessToResource,
} = vi.hoisted(() => ({
  useDividasMotorista: vi.fn(),
  useMarcarDividaPaga: vi.fn(),
  useMarcarDividaNaoPaga: vi.fn(),
  marcarPaga: vi.fn(),
  marcarNaoPaga: vi.fn(),
  hasAccessToResource: vi.fn(),
}));

vi.mock('@/hooks/useDividasMotorista', () => ({
  useDividasMotorista,
  useMarcarDividaPaga,
  useMarcarDividaNaoPaga,
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasAccessToResource }) }));

import { DividasTab } from './DividasTab';

const POR_COBRAR = {
  id: 'm-1',
  motorista_id: 'm-1',
  motorista_nome: 'Ana Costa',
  periodo_inicio: '2026-08-01',
  periodo_fim: '2026-08-07',
  valor_periodo: -110,
  valor_danos: 40,
  valor_caucao: 30,
  valor_total: 110,
  estado: 'por_cobrar' as const,
  pago_em: null,
};

const PAGA = {
  ...POR_COBRAR,
  id: 'd-2',
  motorista_id: 'm-2',
  motorista_nome: 'Bruno Reis',
  estado: 'paga' as const,
  valor_total: 50,
  pago_em: '2026-08-09T10:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  hasAccessToResource.mockReturnValue(true);
  useMarcarDividaPaga.mockReturnValue({ mutate: marcarPaga, isPending: false });
  useMarcarDividaNaoPaga.mockReturnValue({ mutate: marcarNaoPaga, isPending: false });
});

describe('DividasTab', () => {
  it('mostra as dívidas devolvidas pelo hook, com o total das por cobrar', () => {
    useDividasMotorista.mockReturnValue({ data: [POR_COBRAR], isLoading: false });
    render(<DividasTab />);
    expect(screen.getByText('Ana Costa')).toBeInTheDocument();
    // '€110,00' aparece duas vezes (o cartão de total E a coluna Total da
    // linha) — testid a desambiguar o cartão, getAllByText a confirmar as duas.
    expect(screen.getByTestId('dividas-total-por-cobrar')).toHaveTextContent('€110,00');
    expect(screen.getAllByText('€110,00')).toHaveLength(2);
  });

  it('o cartão de total soma só as por cobrar, mesmo com pagas no ecrã', () => {
    useDividasMotorista.mockReturnValue({ data: [POR_COBRAR, PAGA], isLoading: false });
    render(<DividasTab />);
    expect(screen.getByTestId('dividas-total-por-cobrar')).toHaveTextContent('€110,00');
  });

  it('uma dívida por cobrar liquida-se pelo motorista', () => {
    useDividasMotorista.mockReturnValue({ data: [POR_COBRAR], isLoading: false });
    render(<DividasTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar paga' }));
    expect(marcarPaga).toHaveBeenCalledWith('m-1');
    expect(marcarNaoPaga).not.toHaveBeenCalled();
  });

  it('uma dívida paga reabre-se pela liquidação, e o botão alterna', () => {
    useDividasMotorista.mockReturnValue({ data: [PAGA], isLoading: false });
    render(<DividasTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar não paga' }));
    expect(marcarNaoPaga).toHaveBeenCalledWith('d-2');
    expect(marcarPaga).not.toHaveBeenCalled();
  });

  it('sem permissão de gestão não há botões de estado', () => {
    hasAccessToResource.mockReturnValue(false);
    useDividasMotorista.mockReturnValue({ data: [POR_COBRAR, PAGA], isLoading: false });
    render(<DividasTab />);
    expect(screen.queryByRole('button', { name: 'Marcar paga' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar não paga' })).not.toBeInTheDocument();
  });

  it('o mesmo motorista em aberto e uma liquidação antiga não colidem em chave', () => {
    // A chave de uma dívida em aberto é o id do motorista e a de uma paga é o
    // id da liquidação: sem prefixar pelo estado, dois ids iguais rebentavam
    // a lista do React.
    useDividasMotorista.mockReturnValue({
      data: [POR_COBRAR, { ...PAGA, id: 'm-1', motorista_id: 'm-1', motorista_nome: 'Ana Costa' }],
      isLoading: false,
    });
    render(<DividasTab />);
    expect(screen.getAllByText('Ana Costa')).toHaveLength(2);
  });

  it('mostra o erro quando a lista falha', () => {
    useDividasMotorista.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<DividasTab />);
    expect(screen.getByText('Não foi possível carregar as dívidas.')).toBeInTheDocument();
  });
});
