import { describe, it, expect } from 'vitest';

import {
  alertasDocumentos,
  proximaValidade,
  resumoAtencao,
  textoAlerta,
} from './documentosViatura';

const HOJE = new Date('2026-09-30T10:00:00');

describe('alertasDocumentos', () => {
  it('vencido e a vencer (≤30 dias), o mais urgente primeiro', () => {
    const a = alertasDocumentos(
      { inspecao_validade: '2026-10-12', seguro_validade: '2026-09-27' },
      HOJE
    );
    expect(a.map((x) => [x.documento, x.vencido, x.dias])).toEqual([
      ['seguro', true, -3],
      ['inspecao', false, 12],
    ]);
  });

  it('fora da janela de 30 dias ou sem data não é alerta', () => {
    expect(
      alertasDocumentos({ inspecao_validade: '2026-11-15', seguro_validade: null }, HOJE)
    ).toEqual([]);
  });
});

describe('textoAlerta', () => {
  it('diz o documento, se venceu e quando', () => {
    const [seguro, inspecao] = alertasDocumentos(
      { inspecao_validade: '2026-10-01', seguro_validade: '2026-09-27' },
      HOJE
    );
    expect(textoAlerta(seguro)).toBe('Seguro vencido há 3 dias');
    expect(textoAlerta(inspecao)).toBe('Inspeção vence em 1 dia');
    const [hoje] = alertasDocumentos({ seguro_validade: '2026-09-30' }, HOJE);
    expect(textoAlerta(hoje)).toBe('Seguro vence hoje');
  });
});

describe('proximaValidade', () => {
  it('a data mais próxima das duas', () => {
    expect(
      proximaValidade({ inspecao_validade: '2027-01-01', seguro_validade: '2026-12-01' })
    ).toBe('2026-12-01');
    expect(proximaValidade({})).toBeNull();
  });
});

describe('resumoAtencao', () => {
  it('conta vencidas e só-a-vencer; vendidas e inativas não contam', () => {
    const frota = [
      { id: '1', seguro_validade: '2026-09-01', estado: 'disponivel' },
      { id: '2', inspecao_validade: '2026-10-10', estado: 'em_tvde' },
      { id: '3', inspecao_validade: '2026-09-01', estado: 'inativo' },
      { id: '4', inspecao_validade: '2026-09-01', estado: 'vendida', is_vendida: true },
      { id: '5', inspecao_validade: '2027-09-01', estado: 'em_tvde' },
    ];
    expect(resumoAtencao(frota, (v) => v.estado, HOJE)).toEqual({ vencidas: 1, aVencer: 1 });
  });
});
