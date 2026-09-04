import { describe, it, expect } from 'vitest';
import { periodosDeContratos, type ContratoParaPeriodo } from './periodosDoContrato';
import { buildSlotPeriodos } from './slotPeriodos';

const contratoBase: ContratoParaPeriodo = {
  viatura_id: 'v1',
  data_inicio: '2026-08-24T08:39:46.059696+00',
  data_fim: '2026-09-23',
  valor_total_manual: '275.00',
  tarifa_id: 'tarifa-tvde',
  estado_operacional: 'em_curso',
  substituido_em: null,
  viaturas: { matricula: 'BT-21-UN', modelo_id: 'm1', grupo_id: 'g1' },
};

describe('periodosDeContratos', () => {
  it('usa as datas do CONTRATO, não as da atribuição da viatura', () => {
    // O caso real: contrato criado a 01/09 com início retroactivo a 24/08.
    // A atribuição da viatura ficou com 01/09 e o resumo da semana de
    // 24–30/08 mostrava 0,00 €. Lendo o contrato, a semana tem aluguer.
    const { periodos } = periodosDeContratos([contratoBase]);
    expect(periodos).toHaveLength(1);
    expect(periodos[0].data_inicio).toBe('2026-08-24');
    expect(periodos[0].data_fim).toBe('2026-09-23');
  });

  it('o preço acordado no contrato manda sobre a tabela de tarifas', () => {
    const { periodos, estimado } = periodosDeContratos([contratoBase], {
      porTarifaModelo: new Map([['tarifa-tvde|m1', 325]]),
    });
    expect(periodos[0].preco_semana).toBe(275);
    expect(estimado).toBe(false);
  });

  it('sem valor acordado, usa a tarifa QUE O CONTRATO indica', () => {
    const { periodos, estimado } = periodosDeContratos(
      [{ ...contratoBase, valor_total_manual: null }],
      { porTarifaModelo: new Map([['tarifa-tvde|m1', 325]]) }
    );
    expect(periodos[0].preco_semana).toBe(325);
    expect(estimado).toBe(false);
  });

  it('cai na tarifa do grupo só em último recurso, e marca como estimado', () => {
    const { periodos, estimado } = periodosDeContratos(
      [{ ...contratoBase, valor_total_manual: null, tarifa_id: null }],
      { porGrupo: { g1: 200 } }
    );
    expect(periodos[0].preco_semana).toBe(200);
    expect(estimado).toBe(true);
  });

  it('um preço de 0 é um preço legítimo, não uma ausência', () => {
    const { periodos, estimado } = periodosDeContratos(
      [{ ...contratoBase, valor_total_manual: 0 }],
      { porGrupo: { g1: 200 } }
    );
    expect(periodos[0].preco_semana).toBe(0);
    expect(estimado).toBe(false);
  });

  it('ignora um contrato cancelado que nunca foi substituído', () => {
    const { periodos } = periodosDeContratos([
      { ...contratoBase, estado_operacional: 'cancelado', substituido_em: null },
    ]);
    expect(periodos).toHaveLength(0);
  });

  it('mantém um contrato cancelado QUE FOI substituído (teve dias reais)', () => {
    const { periodos } = periodosDeContratos([
      { ...contratoBase, estado_operacional: 'cancelado', substituido_em: '2026-08-28' },
    ]);
    expect(periodos).toHaveLength(1);
  });

  it('ignora contratos sem viatura ou sem data de início', () => {
    const { periodos } = periodosDeContratos([
      { ...contratoBase, viatura_id: null },
      { ...contratoBase, data_inicio: null },
    ]);
    expect(periodos).toHaveLength(0);
  });

  it('caso Paulo Badalo: contrato 24/08→23/09 a 275 €, semana 24–30/08', () => {
    const { periodos } = periodosDeContratos([contratoBase]);
    const slots = buildSlotPeriodos(
      periodos,
      new Date('2026-08-24T00:00:00Z'),
      new Date('2026-08-30T00:00:00Z'),
      new Map()
    );
    // O dia do levantamento (24/08) não se cobra — sobram 6 dias dos 7.
    expect(slots).toHaveLength(1);
    expect(slots[0].dias).toBe(6);
    expect(slots[0].custo).toBeCloseTo((275 / 7) * 6, 2);
    expect(slots[0].matricula).toBe('BT-21-UN');
  });
});
