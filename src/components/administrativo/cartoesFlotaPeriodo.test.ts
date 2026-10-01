import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deslocarPeriodo,
  limitesRpc,
  periodoIncluiHoje,
  periodoPorOmissao,
  rotuloPeriodo,
} from './cartoesFlotaPeriodo';

const d = (iso: string) => new Date(`${iso}T00:00:00`);
// `endOfMonth`/`endOfWeek` devolvem 23:59:59.999; só o dia interessa.
const dia = (x: Date) => x.toDateString();

afterEach(() => vi.useRealTimers());

describe('deslocarPeriodo', () => {
  it('anda de mês em mês quando o período é um mês completo', () => {
    const anterior = deslocarPeriodo({ from: d('2026-09-01'), to: d('2026-09-30') }, -1);
    expect(dia(anterior.from)).toBe(dia(d('2026-08-01')));
    expect(dia(anterior.to)).toBe(dia(d('2026-08-31')));
  });

  it('desliza pela própria duração quando o período é um intervalo qualquer', () => {
    const seguinte = deslocarPeriodo({ from: d('2026-09-10'), to: d('2026-09-16') }, 1);
    expect(seguinte.from).toEqual(d('2026-09-17'));
    expect(seguinte.to).toEqual(d('2026-09-23'));
  });
});

// A RPC filtra com `transaction_date < p_ate`: sem o dia a mais, o último dia
// do período não entrava no consumo.
describe('limitesRpc', () => {
  it('trata o fim como exclusivo', () => {
    const { desde, ate } = limitesRpc({ from: d('2026-09-01'), to: d('2026-09-30') });
    expect(desde).toBe(d('2026-09-01').toISOString());
    expect(ate).toBe(d('2026-10-01').toISOString());
  });
});

describe('periodoIncluiHoje', () => {
  it('distingue um período em curso de um período já fechado', () => {
    vi.useFakeTimers().setSystemTime(d('2026-09-17'));
    expect(periodoIncluiHoje({ from: d('2026-09-01'), to: d('2026-09-30') })).toBe(true);
    expect(periodoIncluiHoje({ from: d('2026-08-01'), to: d('2026-08-31') })).toBe(false);
  });
});

describe('rotuloPeriodo', () => {
  it('marca o mês atual e deixa os outros períodos só com as datas', () => {
    vi.useFakeTimers().setSystemTime(d('2026-09-17'));
    expect(rotuloPeriodo(periodoPorOmissao())).toBe('01/09 - 30/09/2026 (Mês atual)');
    expect(rotuloPeriodo({ from: d('2026-08-01'), to: d('2026-08-31') })).toBe(
      '01/08 - 31/08/2026'
    );
  });
});
