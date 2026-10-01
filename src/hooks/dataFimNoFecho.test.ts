import { describe, it, expect } from 'vitest';
import { dataFimNoFecho } from './useContratosRenting';

describe('dataFimNoFecho', () => {
  const evento = '2026-09-24T15:00:00.000Z';

  it('TVDE sem data_fim → dataEvento', () => {
    expect(dataFimNoFecho({ regime: 'tvde', data_fim: null }, evento)).toBe(evento);
  });
  it('TVDE com data_fim de legado anterior ao fecho → mantém-na (não cobra o intervalo)', () => {
    expect(
      dataFimNoFecho({ regime: 'tvde', data_fim: '2026-09-06T10:00:00.000Z' }, evento)
    ).toBeUndefined();
  });
  it('TVDE com data_fim posterior ao fecho → dataEvento', () => {
    expect(dataFimNoFecho({ regime: 'tvde', data_fim: '2026-10-24T13:41:00.000Z' }, evento)).toBe(
      evento
    );
  });
  it('rent-a-car → não escreve', () => {
    expect(dataFimNoFecho({ regime: 'rent_a_car', data_fim: null }, evento)).toBeUndefined();
    expect(
      dataFimNoFecho({ regime: 'rent_a_car', data_fim: '2026-10-24T13:41:00.000Z' }, evento)
    ).toBeUndefined();
  });
  it('contrato não lido → não escreve', () => {
    expect(dataFimNoFecho(null, evento)).toBeUndefined();
  });
});
