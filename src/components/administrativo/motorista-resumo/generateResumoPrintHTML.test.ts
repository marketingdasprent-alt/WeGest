import { describe, it, expect } from 'vitest';
import { generateResumoPrintHTML } from './generateResumoPrintHTML';
import type { SlotPeriodo } from '../MotoristaResumoDialog';

const baseParams = {
  driverName: 'João Silva',
  dateRange: { from: new Date('2026-01-01'), to: new Date('2026-01-07') },
  settings: { orientacao: 'portrait' as const },
  logoSrc: 'https://example.com/logo.png',
  infoFields: [
    { key: 'nome', label: 'Nome', value: 'João Silva', always: true },
    { key: 'matricula', label: 'Matrícula', value: 'AB-12-CD', show: true },
  ],
  isImportado: false,
  receitas: { bolt: 500, uber: 300, outras_receitas: 50 },
  totalReceitas: 850,
  receitaAjustada: 830,
  despesas: {
    aluguer: 200,
    combustivel: 100,
    portagens: 30,
    outros_custos: 20,
    caucao: 0,
    seguros: 50,
    reparacoes: 10,
  },
  totalDespesas: 410,
  slotPeriodos: [] as SlotPeriodo[],
  totalSlot: 0,
  valoresSemanaAnterior: 0,
  totalAReceber: 440,
  liquido: 440,
};

describe('generateResumoPrintHTML', () => {
  it('returns a complete HTML document', () => {
    const html = generateResumoPrintHTML(baseParams);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<body onload="window.print()">');
  });

  it('includes the driver name in the title', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).toContain('<title>Resumo Financeiro — João Silva</title>');
  });

  it('includes the logo image', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).toContain('src="https://example.com/logo.png"');
  });

  it('formats currency values in EUR (pt-PT)', () => {
    const html = generateResumoPrintHTML(baseParams);
    // 500 € in pt-PT format
    expect(html).toContain('500,00');
    expect(html).toContain('€');
  });

  it('includes receitas values', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).toContain('Bolt');
    expect(html).toContain('Uber');
    expect(html).toContain('Outras Receitas');
  });

  it('includes despesas values', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).toContain('Aluguer');
    expect(html).toContain('Combustível');
    expect(html).toContain('Portagens');
    expect(html).toContain('Reparações');
  });

  it('includes the liquido value', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).toContain('VALOR LÍQUIDO A RECEBER');
  });

  it('includes the WeGest footer', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).toContain('WeGest, Lda.');
    expect(html).toContain('NIF: 515127850');
  });

  it('uses portrait orientation by default', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).toContain('@page{size:portrait');
  });

  it('uses landscape orientation when configured', () => {
    const html = generateResumoPrintHTML({
      ...baseParams,
      settings: { orientacao: 'landscape' },
    });
    expect(html).toContain('@page{size:landscape');
  });

  it('nunca mostra linha de gorjeta (já embutida no TOTAL RECEITAS)', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).not.toContain('Gorjetas (sem IVA)');
  });

  it('includes slot detail section when slotPeriodos is non-empty', () => {
    const slotPeriodos: SlotPeriodo[] = [
      {
        matricula: 'XX-99-YY',
        dias: 7,
        taxaDiaria: 28.57,
        custo: 200,
        dataInicioStr: '01/01',
        dataFimStr: '07/01',
      },
    ];
    const html = generateResumoPrintHTML({
      ...baseParams,
      slotPeriodos,
      totalSlot: 200,
    });
    expect(html).toContain('ALUGUER — DETALHE');
    expect(html).toContain('XX-99-YY');
  });

  it('shows TOTAL ALUGUER row when there are multiple slot periodos', () => {
    const slotPeriodos: SlotPeriodo[] = [
      {
        matricula: 'XX-99-YY',
        dias: 3,
        taxaDiaria: 28.57,
        custo: 85.71,
        dataInicioStr: '01/01',
        dataFimStr: '03/01',
      },
      {
        matricula: 'ZZ-00-AA',
        dias: 4,
        taxaDiaria: 28.57,
        custo: 114.29,
        dataInicioStr: '04/01',
        dataFimStr: '07/01',
      },
    ];
    const html = generateResumoPrintHTML({
      ...baseParams,
      slotPeriodos,
      totalSlot: 200,
    });
    expect(html).toContain('TOTAL ALUGUER');
  });

  it('omits slot detail section when slotPeriodos is empty', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).not.toContain('ALUGUER — DETALHE');
  });

  it('uses blue color for positive liquido', () => {
    const html = generateResumoPrintHTML({ ...baseParams, liquido: 440 });
    expect(html).toContain('#2563eb');
  });

  it('uses orange color for negative liquido', () => {
    const html = generateResumoPrintHTML({ ...baseParams, liquido: -100 });
    expect(html).toContain('#f97316');
  });

  it('uses totalReceitas when isImportado is true', () => {
    const html = generateResumoPrintHTML({
      ...baseParams,
      isImportado: true,
      totalReceitas: 999,
    });
    // In the receitas card header, it should show 999,00 (totalReceitas) not 830,00 (receitaAjustada)
    expect(html).toContain('999,00');
  });

  it('uses receitaAjustada when isImportado is false', () => {
    const html = generateResumoPrintHTML({
      ...baseParams,
      isImportado: false,
      receitaAjustada: 777,
    });
    expect(html).toContain('777,00');
  });

  it('includes infoFields labels and values', () => {
    const html = generateResumoPrintHTML(baseParams);
    expect(html).toContain('Nome');
    expect(html).toContain('João Silva');
    expect(html).toContain('Matrícula');
    expect(html).toContain('AB-12-CD');
  });

  it('mostra aviso "Sem tarifa" no aluguer quando aluguerSemTarifa é true', () => {
    const html = generateResumoPrintHTML({ ...baseParams, aluguerSemTarifa: true });
    expect(html).toContain('Sem tarifa configurada');
  });

  it('mostra o valor do aluguer quando aluguerSemTarifa é false/omitido', () => {
    const html = generateResumoPrintHTML({
      ...baseParams,
      despesas: { ...baseParams.despesas, aluguer: 175 },
    });
    expect(html).not.toContain('Sem tarifa configurada');
    expect(html).toContain('175,00');
  });

  it('shows "—" for null infoField values', () => {
    const html = generateResumoPrintHTML({
      ...baseParams,
      infoFields: [{ key: 'test', label: 'Test', value: null, always: true }],
    });
    expect(html).toContain('—');
  });
});
