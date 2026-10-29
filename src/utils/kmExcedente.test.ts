import { describe, it, expect } from 'vitest';

import {
  calcularKmExcedente,
  destinoKmExtra,
  kmAbaixoDaSaida,
  lerKmSaidaCorrigido,
  motivoSemCalculo,
} from './kmExcedente';

describe('lerKmSaidaCorrigido', () => {
  it('km inteiro e positivo passa', () => {
    expect(lerKmSaidaCorrigido('97785')).toBe(97785);
  });

  it('a não corrigir, vazio ou inválido dá null', () => {
    expect(lerKmSaidaCorrigido(null)).toBeNull();
    expect(lerKmSaidaCorrigido('  ')).toBeNull();
    expect(lerKmSaidaCorrigido('0')).toBeNull();
    expect(lerKmSaidaCorrigido('-5')).toBeNull();
    expect(lerKmSaidaCorrigido('12,5')).toBeNull();
    expect(lerKmSaidaCorrigido('abc')).toBeNull();
  });
});

describe('kmAbaixoDaSaida', () => {
  it('km de entrada menor que o de saída bloqueia', () => {
    expect(kmAbaixoDaSaida(135035, 124679)).toBe(true);
  });

  it('igual ou acima não bloqueia', () => {
    expect(kmAbaixoDaSaida(135035, 135035)).toBe(false);
    expect(kmAbaixoDaSaida(135035, 136000)).toBe(false);
  });

  it('sem km de saída ou sem km de entrada não bloqueia', () => {
    expect(kmAbaixoDaSaida(null, 100)).toBe(false);
    expect(kmAbaixoDaSaida(0, 100)).toBe(false);
    expect(kmAbaixoDaSaida(135035, null)).toBe(false);
    expect(kmAbaixoDaSaida(135035, Number.NaN)).toBe(false);
  });
});

describe('motivoSemCalculo', () => {
  it('sem km de saída diz isso', () => {
    expect(motivoSemCalculo(0, 12500)).toContain('Sem km de saída');
    expect(motivoSemCalculo(null, 12500)).toContain('Sem km de saída');
  });

  it('km de entrada abaixo do de saída mostra os dois números', () => {
    const m = motivoSemCalculo(135035, 124679);
    expect(m).toContain('menor que o km com que a viatura saiu');
    expect(m).toContain('124');
    expect(m).toContain('135');
  });

  it('sem km de entrada pede-o', () => {
    expect(motivoSemCalculo(10000, null)).toContain('Indica o km de entrada');
  });
});

describe('destinoKmExtra', () => {
  it('TVDE com motorista vai para a conta-corrente', () => {
    expect(destinoKmExtra({ regime: 'tvde', temMotorista: true, faturado: false })).toEqual({
      texto: 'Fica como débito pendente na conta-corrente do motorista.',
      faturarAParte: false,
    });
  });

  it('rent-a-car por faturar entra na fatura do contrato', () => {
    const d = destinoKmExtra({ regime: 'rent_a_car', temMotorista: false, faturado: false });
    expect(d.texto).toContain('entra na fatura');
    expect(d.faturarAParte).toBe(false);
  });

  it('rent-a-car já faturado avisa para faturar à parte', () => {
    expect(
      destinoKmExtra({ regime: 'rent_a_car', temMotorista: true, faturado: true }).faturarAParte
    ).toBe(true);
  });

  it('TVDE sem motorista cai nos extras do contrato', () => {
    expect(
      destinoKmExtra({ regime: 'tvde', temMotorista: false, faturado: false }).texto
    ).toContain('extras do contrato');
  });
});

const base = { kmSaida: 10000, kmsIncluidos: 2000, kmAdicionalValor: 0.125 };

describe('calcularKmExcedente', () => {
  it('cobra só os km acima do limite', () => {
    expect(calcularKmExcedente({ ...base, kmEntrada: 12500 })).toEqual({
      kmPercorridos: 2500,
      kmExcedente: 500,
      valor: 62.5,
    });
  });

  it('arredonda o valor a cêntimos', () => {
    expect(calcularKmExcedente({ ...base, kmEntrada: 12833 })?.valor).toBe(104.13);
  });

  it('no limite ou abaixo não cobra nada', () => {
    expect(calcularKmExcedente({ ...base, kmEntrada: 12000 })).toEqual({
      kmPercorridos: 2000,
      kmExcedente: 0,
      valor: 0,
    });
    expect(calcularKmExcedente({ ...base, kmEntrada: 11500 })?.valor).toBe(0);
  });

  it('km ilimitados ou sem preço por km não cobram', () => {
    expect(calcularKmExcedente({ ...base, kmsIncluidos: null, kmEntrada: 19000 })?.valor).toBe(0);
    expect(calcularKmExcedente({ ...base, kmAdicionalValor: null, kmEntrada: 19000 })?.valor).toBe(
      0
    );
  });

  it('sem km de saída, sem km de entrada ou com o km a descer não há conta', () => {
    expect(calcularKmExcedente({ ...base, kmSaida: null, kmEntrada: 12500 })).toBeNull();
    expect(calcularKmExcedente({ ...base, kmSaida: 0, kmEntrada: 112408 })).toBeNull();
    expect(calcularKmExcedente({ ...base, kmEntrada: null })).toBeNull();
    expect(calcularKmExcedente({ ...base, kmEntrada: Number.NaN })).toBeNull();
    expect(calcularKmExcedente({ ...base, kmEntrada: 9000 })).toBeNull();
  });
});
