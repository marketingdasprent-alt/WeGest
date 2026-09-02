// src/components/motoristas/tabs/AdicionarDividaDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { calcular, criar, dividasAbertas } = vi.hoisted(() => ({
  calcular: vi.fn(),
  criar: vi.fn(),
  dividasAbertas: vi.fn(),
}));

vi.mock('@/hooks/useDividasMotorista', () => ({
  useCalcularDivida: (...args: unknown[]) => calcular(...args),
  useCriarDivida: () => ({ mutateAsync: criar, isPending: false }),
  useDividasAbertasDoMotorista: (...args: unknown[]) => dividasAbertas(...args),
}));

import { AdicionarDividaDialog } from './AdicionarDividaDialog';

function renderDialog(onSuccess = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AdicionarDividaDialog
        motoristaId="m-1"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calcular.mockReturnValue({ data: undefined, isFetching: false });
  criar.mockResolvedValue(undefined);
  dividasAbertas.mockReturnValue({ data: [], isFetching: false });
});

describe('AdicionarDividaDialog', () => {
  it('não deixa confirmar com fim anterior ao início', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-10' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-08-01' } });
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled();
  });

  it('mostra a pré-visualização dos quatro valores', () => {
    calcular.mockReturnValue({
      data: {
        valorPeriodo: -100,
        valorDanos: 40,
        valorCaucao: 30,
        valorTotal: 110,
        motoristaNome: 'Ana Costa',
      },
      isFetching: false,
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-08-07' } });

    expect(screen.getByText('-€100,00')).toBeInTheDocument();
    expect(screen.getByText('€40,00')).toBeInTheDocument();
    expect(screen.getByText('€30,00')).toBeInTheDocument();
    expect(screen.getByText('€110,00')).toBeInTheDocument();
  });

  it('confirmar cria a dívida com exactamente os valores pré-visualizados', async () => {
    calcular.mockReturnValue({
      data: {
        valorPeriodo: -100,
        valorDanos: 40,
        valorCaucao: 30,
        valorTotal: 110,
        motoristaNome: 'Ana Costa',
      },
      isFetching: false,
    });
    const onSuccess = vi.fn();
    renderDialog(onSuccess);
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-08-07' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(criar).toHaveBeenCalled());
    expect(criar).toHaveBeenCalledWith({
      motoristaId: 'm-1',
      motoristaNome: 'Ana Costa',
      periodoInicio: '2026-08-01',
      periodoFim: '2026-08-07',
      valores: { valorPeriodo: -100, valorDanos: 40, valorCaucao: 30, valorTotal: 110 },
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('avisa quando o motorista já tem dívidas em aberto com caução', () => {
    dividasAbertas.mockReturnValue({
      data: [
        { id: 'd-1', periodo_inicio: '2026-07-01', periodo_fim: '2026-07-07', valor_caucao: 100 },
      ],
      isFetching: false,
    });
    renderDialog();
    expect(screen.getByTestId('aviso-caucao-duplicada')).toBeInTheDocument();
    expect(screen.getByTestId('aviso-caucao-duplicada')).toHaveTextContent(
      'Este motorista já tem 1 dívida(s) em aberto'
    );
  });

  it('não mostra aviso quando o motorista não tem dívidas em aberto', () => {
    dividasAbertas.mockReturnValue({ data: [], isFetching: false });
    renderDialog();
    expect(screen.queryByTestId('aviso-caucao-duplicada')).not.toBeInTheDocument();
  });
});
