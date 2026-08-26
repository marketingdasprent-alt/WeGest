import { describe, it, expect } from 'vitest';
import { inicioDaSemana, fimDaSemana, paraDataSql } from './useMotoristaExtratoPeriodo';

/**
 * A fronteira da semana decide que dinheiro entra no extrato. Se estiver errada
 * por um dia, o motorista vê os ganhos de outra semana — por isso os dias todos
 * são testados, não só um exemplo.
 */
describe('semana de segunda a domingo', () => {
  it('a segunda-feira é o próprio dia', () => {
    const seg = new Date(2026, 7, 17); // 17/08/2026 é segunda
    expect(paraDataSql(inicioDaSemana(seg))).toBe('2026-08-17');
    expect(paraDataSql(fimDaSemana(seg))).toBe('2026-08-23');
  });

  it('o domingo pertence à semana que começou na segunda anterior', () => {
    const dom = new Date(2026, 7, 23);
    expect(paraDataSql(inicioDaSemana(dom))).toBe('2026-08-17');
    expect(paraDataSql(fimDaSemana(dom))).toBe('2026-08-23');
  });

  it('todos os dias da mesma semana dão a mesma fronteira', () => {
    for (let d = 17; d <= 23; d++) {
      const dia = new Date(2026, 7, d);
      expect(paraDataSql(inicioDaSemana(dia))).toBe('2026-08-17');
      expect(paraDataSql(fimDaSemana(dia))).toBe('2026-08-23');
    }
  });

  it('atravessa a mudança de mês sem se perder', () => {
    // 01/09/2026 é terça; a semana começou a 31 de Agosto.
    const ter = new Date(2026, 8, 1);
    expect(paraDataSql(inicioDaSemana(ter))).toBe('2026-08-31');
    expect(paraDataSql(fimDaSemana(ter))).toBe('2026-09-06');
  });

  it('a data vai em hora local, não em UTC', () => {
    // Às 00:30 de Lisboa no Verão, toISOString() daria o dia anterior — era
    // assim que o extrato mostrava a semana errada de madrugada.
    const madrugada = new Date(2026, 7, 17, 0, 30);
    expect(paraDataSql(madrugada)).toBe('2026-08-17');
  });
});
