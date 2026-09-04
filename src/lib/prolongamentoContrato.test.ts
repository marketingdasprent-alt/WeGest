import { describe, it, expect } from 'vitest';
import { contratoDias } from './contratoDias';
import { diariaDoContrato, calcularProlongamento } from './prolongamentoContrato';

// Contrato típico: 30 dias, 1.400 € acordados à mão. Diária = 46,67 €.
const CONTRATO = {
  data_inicio: '2026-08-01T00:00:00Z',
  data_fim: '2026-08-31T00:00:00Z',
  valor_total_manual: 1400,
};

describe('contratoDias', () => {
  it('conta por dia iniciado — 1 dia e 1 hora são 2 dias', () => {
    expect(contratoDias('2026-08-01T00:00:00Z', '2026-08-02T01:00:00Z')).toBe(2);
  });

  it('um período exacto de 30 dias são 30 dias', () => {
    expect(contratoDias('2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z')).toBe(30);
  });

  it('sem datas, ou com intervalo nulo ou negativo, dá 0', () => {
    expect(contratoDias(null, '2026-08-31T00:00:00Z')).toBe(0);
    expect(contratoDias('2026-08-01T00:00:00Z', null)).toBe(0);
    expect(contratoDias('2026-08-31T00:00:00Z', '2026-08-01T00:00:00Z')).toBe(0);
    expect(contratoDias('2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z')).toBe(0);
  });
});

describe('diariaDoContrato', () => {
  it('reparte o valor acordado pelos dias do contrato', () => {
    expect(diariaDoContrato(CONTRATO)).toBeCloseTo(1400 / 30, 6);
  });

  it('sem valor manual, usa a tarifa diária', () => {
    expect(
      diariaDoContrato({ ...CONTRATO, valor_total_manual: null, tarifa_diaria: 45 })
    ).toBe(45);
  });

  it('o valor manual manda sobre a tarifa diária, como no congelamento de totais', () => {
    expect(diariaDoContrato({ ...CONTRATO, tarifa_diaria: 45 })).toBeCloseTo(1400 / 30, 6);
  });

  it('sem nenhum dos dois não inventa preço', () => {
    expect(
      diariaDoContrato({ ...CONTRATO, valor_total_manual: null, tarifa_diaria: null })
    ).toBeNull();
  });

  it('aceita valores em texto, como vêm do numeric do Postgres', () => {
    expect(diariaDoContrato({ ...CONTRATO, valor_total_manual: '1400.00' })).toBeCloseTo(
      1400 / 30,
      6
    );
  });
});

describe('calcularProlongamento', () => {
  it('3 dias a mais valem 3 diárias, arredondado ao cêntimo', () => {
    const r = calcularProlongamento(CONTRATO, '2026-09-03T00:00:00Z');
    expect(r.diasExtra).toBe(3);
    expect(r.valorSugerido).toBe(140); // 1400/30*3 = 139,999… → 140,00
  });

  it('conta os dias a partir da data de fim actual, não do início', () => {
    const r = calcularProlongamento(CONTRATO, '2026-09-10T00:00:00Z');
    expect(r.diasExtra).toBe(10);
  });

  it('uma data que não estica nada dá 0 dias e nenhum valor', () => {
    expect(calcularProlongamento(CONTRATO, '2026-08-31T00:00:00Z')).toMatchObject({
      diasExtra: 0,
      valorSugerido: null,
    });
    expect(calcularProlongamento(CONTRATO, '2026-08-20T00:00:00Z')).toMatchObject({
      diasExtra: 0,
      valorSugerido: null,
    });
  });

  it('sem data nova não calcula nada', () => {
    expect(calcularProlongamento(CONTRATO, null)).toMatchObject({
      diasExtra: 0,
      valorSugerido: null,
    });
  });

  it('sem preço no contrato dá os dias mas não sugere valor', () => {
    const r = calcularProlongamento(
      { ...CONTRATO, valor_total_manual: null, tarifa_diaria: null },
      '2026-09-03T00:00:00Z'
    );
    expect(r.diasExtra).toBe(3);
    expect(r.diaria).toBeNull();
    expect(r.valorSugerido).toBeNull();
  });
});
