import { describe, it, expect } from 'vitest';
import {
  contratoRenovavel,
  contratosPorRenovar,
  estadoRenovacaoContrato,
  proximaDataRenovacao,
  type ContratoRenovavelInput,
} from './renovacaoContrato';

const base: ContratoRenovavelInput = {
  regime: 'rent_a_car',
  is_longa_duracao: true,
  substituido_em: null,
  estado_operacional: 'em_curso',
  data_fim: '2026-07-13T10:00:00Z',
  deleted_at: null,
};

const iso = (s: string) => `${s}T10:00:00Z`;

describe('proximaDataRenovacao', () => {
  it('intervalo_dias soma N dias', () => {
    expect(proximaDataRenovacao(iso('2026-01-15'), 'intervalo_dias', 30).getUTCDate()).toBe(14);
    expect(proximaDataRenovacao(iso('2026-01-15'), 'intervalo_dias', 30).getUTCMonth()).toBe(1); // Fev
  });

  it('sem opção usa 30 dias por defeito', () => {
    const d = proximaDataRenovacao(iso('2026-01-15'), null, null);
    expect(d.getUTCMonth()).toBe(1);
    expect(d.getUTCDate()).toBe(14);
  });

  it('mesmo_dia_cada_mes soma 1 mês mantendo o dia', () => {
    const d = proximaDataRenovacao('2026-01-15T10:00', 'mesmo_dia_cada_mes', null);
    expect(d.getMonth()).toBe(1); // Fev
    expect(d.getDate()).toBe(15);
  });

  it('primeiro_dia_mes dá o 1.º dia do mês seguinte', () => {
    const d = proximaDataRenovacao('2026-01-15T10:00', 'primeiro_dia_mes', null);
    expect(d.getMonth()).toBe(1); // Fev
    expect(d.getDate()).toBe(1);
  });
});

describe('contratoRenovavel', () => {
  it('aceita rent-a-car longa duração activo e actual', () => {
    expect(contratoRenovavel(base)).toBe(true);
  });
  it('rejeita TVDE', () => {
    expect(contratoRenovavel({ ...base, regime: 'tvde' })).toBe(false);
  });
  it('rejeita curta duração', () => {
    expect(contratoRenovavel({ ...base, is_longa_duracao: false })).toBe(false);
  });
  it('rejeita versão já substituída', () => {
    expect(contratoRenovavel({ ...base, substituido_em: '2026-07-01T00:00:00Z' })).toBe(false);
  });
  it('rejeita contrato devolvido/fechado', () => {
    expect(contratoRenovavel({ ...base, estado_operacional: 'devolvido' })).toBe(false);
  });
  it('rejeita sem data_fim', () => {
    expect(contratoRenovavel({ ...base, data_fim: null })).toBe(false);
  });
});

describe('estadoRenovacaoContrato', () => {
  const hoje = new Date('2026-07-13T15:00:00');

  it('marca "hoje" quando data_fim é hoje', () => {
    expect(estadoRenovacaoContrato({ ...base, data_fim: '2026-07-13T08:00:00' }, hoje)).toBe(
      'hoje'
    );
  });
  it('marca "atraso" quando data_fim já passou', () => {
    expect(estadoRenovacaoContrato({ ...base, data_fim: '2026-07-10T08:00:00' }, hoje)).toBe(
      'atraso'
    );
  });
  it('devolve null quando a renovação ainda não chegou', () => {
    expect(estadoRenovacaoContrato({ ...base, data_fim: '2026-07-20T08:00:00' }, hoje)).toBeNull();
  });
  it('devolve null para contratos não renováveis', () => {
    expect(
      estadoRenovacaoContrato({ ...base, regime: 'tvde', data_fim: '2026-07-10T08:00:00' }, hoje)
    ).toBeNull();
  });
});

describe('contratosPorRenovar', () => {
  const hoje = new Date('2026-07-13T12:00:00');
  it('inclui hoje + atraso, com atraso primeiro e por data_fim ascendente', () => {
    const contratos = [
      { ...base, id: 'hoje', data_fim: '2026-07-13T08:00:00' },
      { ...base, id: 'atraso-novo', data_fim: '2026-07-12T08:00:00' },
      { ...base, id: 'atraso-antigo', data_fim: '2026-07-01T08:00:00' },
      { ...base, id: 'futuro', data_fim: '2026-08-01T08:00:00' },
    ];
    const r = contratosPorRenovar(contratos, hoje);
    expect(r.map((x) => (x.contrato as any).id)).toEqual(['atraso-antigo', 'atraso-novo', 'hoje']);
    expect(r.every((x) => x.estado)).toBe(true);
  });
});
