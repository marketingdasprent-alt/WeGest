import { describe, expect, it } from 'vitest';
import { entraNosNegativos } from './saldoNegativoResumo';

const inicio = new Date(2026, 9, 26);
const fim = new Date(2026, 10, 1, 23, 59, 59);

describe('entraNosNegativos', () => {
  it('mostra quem não faturou mas ficou negativo pelo aluguer da viatura', () => {
    expect(
      entraNosNegativos({ motorista_id: 'm1', liquido: -250 }, '2026-07-06', inicio, fim)
    ).toBe(true);
  });

  it('esconde saldos positivos ou a zero', () => {
    expect(entraNosNegativos({ motorista_id: 'm1', liquido: 0 }, undefined, inicio, fim)).toBe(
      false
    );
    expect(entraNosNegativos({ motorista_id: 'm1', liquido: 10 }, undefined, inicio, fim)).toBe(
      false
    );
  });

  it('esconde quem foi contratado nessa semana', () => {
    expect(
      entraNosNegativos({ motorista_id: 'm1', liquido: -250 }, '2026-10-28', inicio, fim)
    ).toBe(false);
  });
});
