import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useFaturacaoMovimentos } from './useFaturacaoMovimentos';

const MOVIMENTOS = [
  // 3 de Janeiro e 5 de Janeiro: mesma semana (a de 29 Dez), meses iguais.
  { valor: 100, tipo: 'debito', origem: 'cobranca', data_movimento: '2026-01-03' },
  { valor: 50, tipo: 'debito', origem: 'cobranca', data_movimento: '2026-01-05' },
  // Nota de crédito: baixa o valor mas não conta como factura.
  { valor: 30, tipo: 'credito', origem: 'nota_credito', data_movimento: '2026-01-05' },
  // Março — outro mês, outra semana.
  { valor: 200, tipo: 'debito', origem: 'cobranca', data_movimento: '2026-03-10' },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({
          gte: () => ({
            lte: () => Promise.resolve({ data: MOVIMENTOS, error: null }),
          }),
        }),
      }),
    }),
  },
}));

function renderPeriodo(inicio: string, fim: string) {
  return renderHook(() =>
    useFaturacaoMovimentos(
      new Date(`${inicio}T00:00:00`),
      new Date(`${fim}T00:00:00`),
      new Date('2026-01-05T00:00:00'),
      new Date('2026-01-11T00:00:00')
    )
  );
}

describe('useFaturacaoMovimentos', () => {
  it('agrupa ao dia num período curto e enche os dias sem movimento', async () => {
    const { result } = renderPeriodo('2026-01-01', '2026-01-07');
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Sete dias, sete barras — incluindo as que ficam a zero.
    expect(result.current.serie).toHaveLength(7);
    expect(result.current.serie.map((p) => p.label)).toEqual([
      '01/01',
      '02/01',
      '03/01',
      '04/01',
      '05/01',
      '06/01',
      '07/01',
    ]);
    expect(result.current.serie[2]).toMatchObject({ valor: 100, contagem: 1 });
    // 50 de débito menos 30 de nota de crédito, e só o débito conta como factura.
    expect(result.current.serie[4]).toMatchObject({ valor: 20, contagem: 1 });
    expect(result.current.serie[0]).toMatchObject({ valor: 0, contagem: 0 });
  });

  it('agrupa ao mês num período longo, sem perder movimentos pelo caminho', async () => {
    const { result } = renderPeriodo('2026-01-01', '2026-12-31');
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.serie).toHaveLength(12);
    // Janeiro junta os três movimentos: 100 + 50 − 30.
    expect(result.current.serie[0]).toMatchObject({ valor: 120, contagem: 2 });
    expect(result.current.serie[2]).toMatchObject({ valor: 200, contagem: 1 });
    // O total do período tem de bater certo com a soma dos baldes — é o mesmo
    // número que aparece ao lado do gráfico.
    const somaBaldes = result.current.serie.reduce((s, p) => s + p.valor, 0);
    expect(result.current.periodo.valor).toBe(somaBaldes);
    expect(result.current.periodo).toMatchObject({ valor: 320, count: 3 });
  });

  it('agrupa à semana num período intermédio', async () => {
    const { result } = renderPeriodo('2026-01-01', '2026-03-31');
    await waitFor(() => expect(result.current.loading).toBe(false));

    // A primeira semana começa ANTES do início do período (segunda, 29 Dez):
    // o sábado 3 de Janeiro cai lá, e não pode escapar ao balde por o início
    // da semana estar fora do intervalo pedido.
    expect(result.current.serie[0]).toMatchObject({ label: '29/12', valor: 100, contagem: 1 });
    // 5 de Janeiro é segunda — abre semana nova.
    expect(result.current.serie[1]).toMatchObject({ label: '05/01', valor: 20, contagem: 1 });
    const somaBaldes = result.current.serie.reduce((s, p) => s + p.valor, 0);
    expect(somaBaldes).toBe(result.current.periodo.valor);
  });
});
