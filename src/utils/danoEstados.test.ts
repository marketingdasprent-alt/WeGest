import { describe, it, expect } from 'vitest';
import { DANO_ESTADOS, getDanoEstado, getDanoEstadoLabel } from './danoEstados';

describe('DANO_ESTADOS', () => {
  it('inclui os estados do processo de sinistro, pela ordem do processo', () => {
    const valores = DANO_ESTADOS.map((e) => e.value);
    expect(valores).toEqual(
      expect.arrayContaining([
        'aguarda_peritagem',
        'condicional',
        'definitivo',
        'ordem_reparacao',
        'perda_total',
        'seguradora_declinou',
      ])
    );
    const ordem = [
      'existente',
      'aguarda_peritagem',
      'condicional',
      'definitivo',
      'ordem_reparacao',
      'em_reparacao',
      'reparado',
    ];
    expect(valores.filter((v) => ordem.includes(v))).toEqual(ordem);
  });

  it('mantém os valores antigos gravados na base de dados', () => {
    for (const v of ['existente', 'em_reparacao', 'reparado', 'irreparavel']) {
      expect(DANO_ESTADOS.some((e) => e.value === v)).toBe(true);
    }
  });

  it('não tem valores repetidos', () => {
    const valores = DANO_ESTADOS.map((e) => e.value);
    expect(new Set(valores).size).toBe(valores.length);
  });
});

describe('getDanoEstado', () => {
  it('devolve o estado conhecido', () => {
    expect(getDanoEstadoLabel('ordem_reparacao')).toBe('Ordem de Reparação');
  });

  it("'pendente' mostra-se como Pendente, não como Existente", () => {
    expect(getDanoEstadoLabel('pendente')).toBe('Pendente');
  });

  it('valor desconhecido mostra-se tal como está; vazio mostra traço', () => {
    expect(getDanoEstado('outro_qualquer').label).toBe('outro_qualquer');
    expect(getDanoEstadoLabel(null)).toBe('—');
  });
});
