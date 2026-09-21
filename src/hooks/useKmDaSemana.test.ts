import { describe, it, expect } from 'vitest';
import { inicioDaSemana, fimDaSemana, paraDataSql } from './useMotoristaExtratoPeriodo';

/**
 * A janela usada pelo `useKmDaSemana` tem de ser a MESMA do resumo e do
 * Relatório de Pagamento. Se divergirem, o painel diz ao motorista que a
 * semana está entregue enquanto o relatório a conta noutra — e paga-se a olhar
 * para o quadro errado.
 */
describe('janela da semana do KM', () => {
  it('começa à segunda e acaba ao domingo', () => {
    // Quarta-feira, 16/09/2026.
    const quarta = new Date(2026, 8, 16);
    expect(paraDataSql(inicioDaSemana(quarta))).toBe('2026-09-14'); // segunda
    expect(paraDataSql(fimDaSemana(quarta))).toBe('2026-09-20'); // domingo
  });

  it('domingo ainda pertence à semana que começou na segunda anterior', () => {
    const domingo = new Date(2026, 8, 20);
    expect(paraDataSql(inicioDaSemana(domingo))).toBe('2026-09-14');
  });

  it('segunda abre semana nova', () => {
    const segunda = new Date(2026, 8, 21);
    expect(paraDataSql(inicioDaSemana(segunda))).toBe('2026-09-21');
  });

  it('o limite superior da consulta é o dia SEGUINTE ao domingo', () => {
    // `created_at` é timestamptz: filtrar por `<= domingo` corta tudo o que
    // for registado no domingo depois da meia-noite, ou seja, o dia inteiro.
    // Por isso a consulta usa `< segunda seguinte`.
    const fim = fimDaSemana(new Date(2026, 8, 16));
    const limiteExclusivo = new Date(fim.getTime() + 86_400_000);
    expect(paraDataSql(limiteExclusivo)).toBe('2026-09-21');
  });
});
