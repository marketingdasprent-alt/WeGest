import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useDividasMotorista, useAtualizarEstadoDivida, mutate, hasAccessToResource } = vi.hoisted(
  () => ({
    useDividasMotorista: vi.fn(),
    useAtualizarEstadoDivida: vi.fn(),
    mutate: vi.fn(),
    hasAccessToResource: vi.fn(),
  })
);

vi.mock('@/hooks/useDividasMotorista', () => ({ useDividasMotorista, useAtualizarEstadoDivida }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasAccessToResource }) }));

import { DividasTab } from './DividasTab';

const DIVIDA_POR_COBRAR = {
  id: 'd-1',
  motorista_id: 'm-1',
  motorista_nome: 'Ana Costa',
  periodo_inicio: '2026-08-01',
  periodo_fim: '2026-08-07',
  valor_periodo: -100,
  valor_danos: 40,
  valor_caucao: 30,
  valor_total: 110,
  estado: 'por_cobrar' as const,
  pago_em: null,
  criado_por_nome: 'Bruno Paulo',
  created_at: '2026-08-08T10:00:00Z',
};

const DIVIDA_PAGA = { ...DIVIDA_POR_COBRAR, id: 'd-2', estado: 'paga' as const, valor_total: 50 };

beforeEach(() => {
  vi.clearAllMocks();
  hasAccessToResource.mockReturnValue(true);
  useAtualizarEstadoDivida.mockReturnValue({ mutate, isPending: false });
});

describe('DividasTab', () => {
  it('mostra as dívidas devolvidas pelo hook, com o total das por cobrar', () => {
    useDividasMotorista.mockReturnValue({ data: [DIVIDA_POR_COBRAR], isLoading: false });
    render(<DividasTab />);
    expect(screen.getByText('Ana Costa')).toBeInTheDocument();
    // '€110,00' aparece duas vezes (o cartão de total E a coluna Total da
    // linha) — testid a desambiguar o cartão, getAllByText a confirmar as
    // duas ocorrências em vez de uma só.
    expect(screen.getByTestId('dividas-total-por-cobrar')).toHaveTextContent('€110,00');
    expect(screen.getAllByText('€110,00')).toHaveLength(2);
  });

  it('o cartão de total soma só as dívidas por cobrar, mesmo com outras no ecrã', () => {
    useDividasMotorista.mockReturnValue({
      data: [DIVIDA_POR_COBRAR, DIVIDA_PAGA],
      isLoading: false,
    });
    render(<DividasTab />);
    // DIVIDA_POR_COBRAR = 110, DIVIDA_PAGA = 50 — o total tem de ser 110 (só
    // a por cobrar), nunca 160 (as duas somadas).
    expect(screen.getByTestId('dividas-total-por-cobrar')).toHaveTextContent('€110,00');
  });

  it('uma dívida paga não mostra as acções de gestão', () => {
    useDividasMotorista.mockReturnValue({ data: [DIVIDA_PAGA], isLoading: false });
    render(<DividasTab />);
    expect(screen.queryByRole('button', { name: /marcar paga/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it('uma dívida por cobrar mostra "Marcar paga", que chama a mutação', () => {
    useDividasMotorista.mockReturnValue({ data: [DIVIDA_POR_COBRAR], isLoading: false });
    render(<DividasTab />);
    fireEvent.click(screen.getByRole('button', { name: /marcar paga/i }));
    expect(mutate).toHaveBeenCalledWith({ id: 'd-1', estado: 'paga' });
  });

  it('o filtro de estado começa em "Por cobrar"', () => {
    useDividasMotorista.mockReturnValue({ data: [], isLoading: false });
    render(<DividasTab />);
    expect(useDividasMotorista).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'por_cobrar' })
    );
  });

  it('mostra uma mensagem de erro distinta do vazio quando a carga falha', () => {
    useDividasMotorista.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<DividasTab />);
    expect(screen.getByText('Não foi possível carregar as dívidas.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma dívida encontrada.')).not.toBeInTheDocument();
  });
});
