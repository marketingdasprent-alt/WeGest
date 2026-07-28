import { describe, it, expect } from 'vitest';
import {
  calcularContasAReceber,
  DIAS_EM_ABERTO_ALERTA,
  type CobrancaEmitida,
} from './useContasAReceber';

const AGORA = new Date('2026-07-24T00:00:00Z');

function diasAtras(dias: number): string {
  return new Date(AGORA.getTime() - dias * 86_400_000).toISOString();
}

function cobranca(overrides: Partial<CobrancaEmitida> & { id: string }): CobrancaEmitida {
  return {
    valor_total: 100,
    emitida_em: diasAtras(5),
    destinatario_nome: 'Cliente Teste',
    contrato_id: null,
    ...overrides,
  };
}

describe('calcularContasAReceber', () => {
  it('soma o saldo de cobranças sem qualquer pagamento ou crédito', () => {
    const resultado = calcularContasAReceber(
      [cobranca({ id: 'c1', valor_total: 100 }), cobranca({ id: 'c2', valor_total: 50 })],
      new Map(),
      new Map()
    );
    expect(resultado.totalAReceber).toBe(150);
  });

  it('desconta recibos activos do saldo', () => {
    const resultado = calcularContasAReceber(
      [cobranca({ id: 'c1', valor_total: 100 })],
      new Map([['c1', 60]]),
      new Map(),
      AGORA
    );
    expect(resultado.totalAReceber).toBe(40);
  });

  it('desconta notas de crédito do saldo', () => {
    const resultado = calcularContasAReceber(
      [cobranca({ id: 'c1', valor_total: 100 })],
      new Map(),
      new Map([['c1', 100]]),
      AGORA
    );
    expect(resultado.totalAReceber).toBe(0);
  });

  it('uma cobrança totalmente liquidada (pago + creditado = total) não entra no saldo', () => {
    const resultado = calcularContasAReceber(
      [cobranca({ id: 'c1', valor_total: 100 })],
      new Map([['c1', 60]]),
      new Map([['c1', 40]]),
      AGORA
    );
    expect(resultado.totalAReceber).toBe(0);
    expect(resultado.emAberto).toEqual([]);
  });

  it('tolera diferenças de arredondamento (cêntimo) como liquidada', () => {
    const resultado = calcularContasAReceber(
      [cobranca({ id: 'c1', valor_total: 100 })],
      new Map([['c1', 99.998]]),
      new Map(),
      AGORA
    );
    expect(resultado.totalAReceber).toBe(0);
  });

  it('não inclui cobranças emitidas há menos dias que o limiar de alerta em "emAberto"', () => {
    const resultado = calcularContasAReceber(
      [cobranca({ id: 'c1', valor_total: 100, emitida_em: diasAtras(DIAS_EM_ABERTO_ALERTA - 1) })],
      new Map(),
      new Map(),
      AGORA
    );
    expect(resultado.totalAReceber).toBe(100);
    expect(resultado.emAberto).toEqual([]);
  });

  it('inclui em "emAberto" cobranças com saldo emitidas há mais dias que o limiar', () => {
    const resultado = calcularContasAReceber(
      [
        cobranca({
          id: 'c1',
          valor_total: 100,
          emitida_em: diasAtras(DIAS_EM_ABERTO_ALERTA + 1),
          destinatario_nome: 'Cliente Antigo',
        }),
      ],
      new Map(),
      new Map(),
      AGORA
    );
    expect(resultado.emAberto).toEqual([
      {
        id: 'c1',
        destinatarioNome: 'Cliente Antigo',
        contratoId: null,
        saldo: 100,
        diasEmAberto: DIAS_EM_ABERTO_ALERTA + 1,
      },
    ]);
  });

  it('ordena "emAberto" da cobrança mais antiga para a mais recente', () => {
    const resultado = calcularContasAReceber(
      [
        cobranca({ id: 'recente', emitida_em: diasAtras(DIAS_EM_ABERTO_ALERTA + 1) }),
        cobranca({ id: 'antiga', emitida_em: diasAtras(DIAS_EM_ABERTO_ALERTA + 90) }),
      ],
      new Map(),
      new Map(),
      AGORA
    );
    expect(resultado.emAberto.map((e) => e.id)).toEqual(['antiga', 'recente']);
  });

  it('cobrança sem emitida_em nunca entra em "emAberto" (diasEmAberto = 0)', () => {
    const resultado = calcularContasAReceber(
      [cobranca({ id: 'c1', emitida_em: null })],
      new Map(),
      new Map(),
      AGORA
    );
    expect(resultado.emAberto).toEqual([]);
    expect(resultado.totalAReceber).toBe(100);
  });

  it('sem cobrangas devolve zeros', () => {
    const resultado = calcularContasAReceber([], new Map(), new Map(), AGORA);
    expect(resultado).toEqual({ totalAReceber: 0, emAberto: [] });
  });
});
