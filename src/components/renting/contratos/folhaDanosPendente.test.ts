import { describe, it, expect } from 'vitest';

import { folhaDanosPendente, contratosFolhaDanosPendentes } from './folhaDanosPendente';
import type { ContratoRenting } from '@/types/contratoRenting';

function contrato(over: Partial<ContratoRenting> = {}): ContratoRenting {
  return {
    id: 'c1',
    codigo: 1,
    estado_operacional: 'em_curso',
    entrega_via_any_rent: false,
    km_saida: null,
    combustivel_saida: null,
    eletricidade_saida: null,
    ...over,
  } as ContratoRenting;
}

describe('folhaDanosPendente', () => {
  it('acende num contrato em curso sem km de saída', () => {
    expect(folhaDanosPendente(contrato(), 'Diesel')).toBe(true);
  });

  it('não acende quando km e combustível de saída estão preenchidos', () => {
    expect(
      folhaDanosPendente(contrato({ km_saida: 45120, combustivel_saida: 'Cheio' }), 'Diesel')
    ).toBe(false);
  });

  it('não acende em contratos entregues via Any Rent (têm alerta próprio)', () => {
    expect(folhaDanosPendente(contrato({ entrega_via_any_rent: true }), 'Diesel')).toBe(false);
  });

  it('não acende num contrato ainda agendado', () => {
    expect(folhaDanosPendente(contrato({ estado_operacional: 'agendado' }), 'Diesel')).toBe(false);
  });

  it('não acende num contrato já fechado', () => {
    expect(folhaDanosPendente(contrato({ estado_operacional: 'fechado' }), 'Diesel')).toBe(false);
  });

  it('acende com km preenchido mas sem nível de combustível numa viatura a diesel', () => {
    expect(folhaDanosPendente(contrato({ km_saida: 45120 }), 'Diesel')).toBe(true);
  });

  it('não exige nível de combustível numa viatura elétrica', () => {
    expect(
      folhaDanosPendente(contrato({ km_saida: 45120, eletricidade_saida: '80%' }), 'Elétrico')
    ).toBe(false);
  });

  it('exige nível de bateria numa viatura elétrica', () => {
    expect(folhaDanosPendente(contrato({ km_saida: 45120 }), 'Elétrico')).toBe(true);
  });

  it('exige combustível e bateria num híbrido', () => {
    expect(
      folhaDanosPendente(contrato({ km_saida: 45120, combustivel_saida: 'Cheio' }), 'Híbrido')
    ).toBe(true);
  });

  it('assume combustível quando o tipo de viatura é desconhecido', () => {
    expect(folhaDanosPendente(contrato({ km_saida: 45120 }), null)).toBe(true);
  });
});

describe('contratosFolhaDanosPendentes', () => {
  it('devolve os contratos em curso sem dados de saída', () => {
    const lista = [
      contrato({ id: 'a' }),
      contrato({ id: 'b', km_saida: 10, combustivel_saida: 'Cheio' }),
    ];
    expect(contratosFolhaDanosPendentes(lista).map((c) => c.id)).toEqual(['a']);
  });

  it('ignora os contratos Any Rent, que já têm o seu próprio banner', () => {
    const lista = [contrato({ id: 'a', entrega_via_any_rent: true })];
    expect(contratosFolhaDanosPendentes(lista)).toEqual([]);
  });

  it('aceita o nível elétrico como dado de saída sem saber o tipo de viatura', () => {
    const lista = [contrato({ id: 'a', km_saida: 10, eletricidade_saida: '80%' })];
    expect(contratosFolhaDanosPendentes(lista)).toEqual([]);
  });
});
