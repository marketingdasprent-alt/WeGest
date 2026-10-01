import { describe, it, expect } from 'vitest';
import { construirSerieTickets, granularidadeTickets, totaisDaSerie } from './serieTickets';

const MOVIMENTOS = [
  { dia: '2026-01-03', abertos: 3, resolvidos: 1 }, // sábado — semana de 29/12
  { dia: '2026-01-05', abertos: 2, resolvidos: 4 }, // segunda — abre semana nova
  { dia: '2026-03-10', abertos: 1, resolvidos: 0 },
  // Fora de qualquer período testado — não pode entrar em soma nenhuma.
  { dia: '2025-11-30', abertos: 9, resolvidos: 9 },
];

const dia = (d: string) => new Date(`${d}T00:00:00`);

describe('granularidadeTickets', () => {
  it('escolhe o dia até dois meses, a semana até meio ano e o mês acima disso', () => {
    expect(granularidadeTickets(dia('2026-01-01'), dia('2026-01-31'))).toBe('dia');
    expect(granularidadeTickets(dia('2026-01-01'), dia('2026-03-31'))).toBe('semana');
    expect(granularidadeTickets(dia('2026-01-01'), dia('2026-12-31'))).toBe('mes');
  });
});

describe('construirSerieTickets', () => {
  it('enche os dias sem movimento num período curto', () => {
    const serie = construirSerieTickets(MOVIMENTOS, {
      from: dia('2026-01-01'),
      to: dia('2026-01-07'),
    });

    expect(serie.map((p) => p.label)).toEqual([
      '01/01',
      '02/01',
      '03/01',
      '04/01',
      '05/01',
      '06/01',
      '07/01',
    ]);
    expect(serie[2]).toMatchObject({ abertos: 3, resolvidos: 1 });
    expect(serie[4]).toMatchObject({ abertos: 2, resolvidos: 4 });
    expect(serie[0]).toMatchObject({ abertos: 0, resolvidos: 0 });
  });

  it('agrupa à semana sem perder os dias que caem na semana anterior ao início', () => {
    const serie = construirSerieTickets(MOVIMENTOS, {
      from: dia('2026-01-01'),
      to: dia('2026-03-31'),
    });

    // A primeira semana começa a 29/12, antes do início do período: o sábado
    // 3 de Janeiro cai lá e não pode escapar ao balde.
    expect(serie[0]).toMatchObject({ label: '29/12', abertos: 3, resolvidos: 1 });
    expect(serie[1]).toMatchObject({ label: '05/01', abertos: 2, resolvidos: 4 });
  });

  it('agrupa ao mês num ano inteiro e deixa de fora o que é anterior ao período', () => {
    const serie = construirSerieTickets(MOVIMENTOS, {
      from: dia('2026-01-01'),
      to: dia('2026-12-31'),
    });

    expect(serie).toHaveLength(12);
    expect(serie[0]).toMatchObject({ abertos: 5, resolvidos: 5 });
    expect(serie[2]).toMatchObject({ abertos: 1, resolvidos: 0 });
    // O movimento de Novembro de 2025 está fora — se entrasse, os totais do
    // ano incluíam trabalho de outro ano.
    expect(totaisDaSerie(serie)).toEqual({ abertos: 6, resolvidos: 5 });
  });
});
