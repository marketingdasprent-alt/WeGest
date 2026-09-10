import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const {
  useDividasMotorista,
  useUltimaSemanaComLiquido,
  useDividasAnterioresPorCobrar,
  useMarcarDividaPaga,
  useMarcarDividaNaoPaga,
  marcarPaga,
  marcarNaoPaga,
  hasAccessToResource,
} = vi.hoisted(() => ({
  useDividasMotorista: vi.fn(),
  useUltimaSemanaComLiquido: vi.fn(),
  useDividasAnterioresPorCobrar: vi.fn(),
  useMarcarDividaPaga: vi.fn(),
  useMarcarDividaNaoPaga: vi.fn(),
  marcarPaga: vi.fn(),
  marcarNaoPaga: vi.fn(),
  hasAccessToResource: vi.fn(),
}));

vi.mock('@/hooks/useDividasMotorista', () => ({
  useDividasMotorista,
  useUltimaSemanaComLiquido,
  useDividasAnterioresPorCobrar,
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
  // O ecrã abre na última semana com líquido gravado; sem isto não escolhe
  // semana nenhuma e não pede dados.
  useUltimaSemanaComLiquido.mockReturnValue({
    data: { inicio: '2026-08-24', fim: '2026-08-30' },
  });
  useMarcarDividaPaga.mockReturnValue({ mutate: marcarPaga, isPending: false });
  useMarcarDividaNaoPaga.mockReturnValue({ mutate: marcarNaoPaga, isPending: false });
  // Por omissão não há nada atrás — cada teste que queira o aviso põe-no.
  useDividasAnterioresPorCobrar.mockReturnValue({
    data: { motoristas: 0, semanas: 0, total: 0, maisAntiga: null },
  });
});

describe('DividasTab', () => {
  it('mostra as dívidas devolvidas pelo hook, com o total das por cobrar', () => {
    useDividasMotorista.mockReturnValue({ data: [POR_COBRAR], isLoading: false });
    render(<DividasTab />);
    expect(screen.getByText('Ana Costa')).toBeInTheDocument();
    // Danos, Caução e Total saíram da tabela — só fica o Saldo (o mesmo valor,
    // em negativo). '€110,00' positivo só aparece no cartão de total.
    expect(screen.getByTestId('dividas-total-por-cobrar')).toHaveTextContent('€110,00');
    expect(screen.getAllByText('€110,00')).toHaveLength(1);
    expect(screen.getByText('-€110,00')).toBeInTheDocument();
  });

  it('o cartão de total soma só as por cobrar, mesmo com pagas no ecrã', () => {
    useDividasMotorista.mockReturnValue({ data: [POR_COBRAR, PAGA], isLoading: false });
    render(<DividasTab />);
    expect(screen.getByTestId('dividas-total-por-cobrar')).toHaveTextContent('€110,00');
  });

  it('uma dívida por cobrar liquida-se pelo motorista, depois de confirmar', () => {
    useDividasMotorista.mockReturnValue({ data: [POR_COBRAR], isLoading: false });
    render(<DividasTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar paga' }));

    // O clique na tabela só abre a confirmação: liquidar todos os movimentos
    // de um motorista não pode acontecer num clique enganado.
    expect(marcarPaga).not.toHaveBeenCalled();
    const dialogo = within(screen.getByRole('alertdialog'));
    expect(dialogo.getByText('Ana Costa')).toBeInTheDocument();

    fireEvent.click(dialogo.getByRole('button', { name: 'Marcar paga' }));
    // O período da linha vai junto: liquidar só a semana à vista, não a conta
    // corrente inteira do motorista.
    expect(marcarPaga).toHaveBeenCalledWith({
      motoristaId: 'm-1',
      periodoInicio: '2026-08-01',
      periodoFim: '2026-08-07',
    });
    expect(marcarNaoPaga).not.toHaveBeenCalled();
  });

  it('cancelar a confirmação não liquida nada', () => {
    useDividasMotorista.mockReturnValue({ data: [POR_COBRAR], isLoading: false });
    render(<DividasTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar paga' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' })
    );
    expect(marcarPaga).not.toHaveBeenCalled();
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

// Numa lista onde cada semana é a sua conta, o que ficou para trás sai de
// vista assim que se avança. Este aviso é o que permite ir acompanhando.
describe('DividasTab — o que ficou de semanas anteriores', () => {
  beforeEach(() => {
    useDividasMotorista.mockReturnValue({ data: [POR_COBRAR], isLoading: false });
  });

  it('não mostra aviso nenhum quando não há nada atrás', () => {
    render(<DividasTab />);
    expect(screen.queryByTestId('dividas-aviso-anteriores')).toBeNull();
  });

  it('conta os motoristas, as semanas e o total por cobrar', () => {
    useDividasAnterioresPorCobrar.mockReturnValue({
      data: {
        motoristas: 19,
        semanas: 3,
        total: 8108.8,
        maisAntiga: { inicio: '2026-08-10', fim: '2026-08-16' },
      },
    });
    render(<DividasTab />);
    const aviso = screen.getByTestId('dividas-aviso-anteriores');
    expect(within(aviso).getByText('19 motoristas')).toBeInTheDocument();
    expect(within(aviso).getByText(/3 semanas anteriores/)).toBeInTheDocument();
    expect(within(aviso).getByText(/8[\s.]?108,80/)).toBeInTheDocument();
  });

  it('no singular não diz "1 motoristas" nem "1 semanas anteriores"', () => {
    useDividasAnterioresPorCobrar.mockReturnValue({
      data: {
        motoristas: 1,
        semanas: 1,
        total: 110,
        maisAntiga: { inicio: '2026-08-10', fim: '2026-08-16' },
      },
    });
    render(<DividasTab />);
    const aviso = screen.getByTestId('dividas-aviso-anteriores');
    expect(within(aviso).getByText('1 motorista')).toBeInTheDocument();
    expect(within(aviso).getByText(/1 semana anterior/)).toBeInTheDocument();
  });

  // Sem isto o aviso diz que há coisas atrás mas não há como lá chegar sem
  // clicar "semana anterior" às cegas até encontrar.
  it('o botão salta para a semana mais antiga por cobrar', () => {
    useDividasAnterioresPorCobrar.mockReturnValue({
      data: {
        motoristas: 2,
        semanas: 1,
        total: 300,
        maisAntiga: { inicio: '2026-08-10', fim: '2026-08-16' },
      },
    });
    render(<DividasTab />);
    fireEvent.click(screen.getByRole('button', { name: /Ir à mais antiga/ }));
    // A lista passa a ser pedida para essa semana, não para a última.
    expect(useDividasMotorista).toHaveBeenLastCalledWith(
      expect.objectContaining({ semanaInicio: '2026-08-10', semanaFim: '2026-08-16' })
    );
  });
});
