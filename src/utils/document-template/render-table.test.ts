import { describe, expect, it, vi } from 'vitest';
import type jsPDF from 'jspdf';
import { findTracoLineIndex, renderTable } from './render-table';
import type { TableCellData, TableCtx } from './types';

describe('findTracoLineIndex', () => {
  it('encontra o traço quando vem DEPOIS do placeholder (padrão "Contrato Aluguer")', () => {
    // Célula: "___________________________" / "NOME" / "O Cliente"
    const lines = [
      { text: '___________________________' },
      { text: 'NOME COMPLETO' },
      { text: 'O Cliente' },
    ];
    expect(findTracoLineIndex(lines)).toBe(0);
  });

  it('encontra o traço quando vem ANTES do placeholder (padrão "Folha de Danos")', () => {
    // Célula: placeholder (linha vazia depois de virar <img>) / traço
    const lines = [{ text: '' }, { text: '________________________' }];
    expect(findTracoLineIndex(lines)).toBe(1);
  });

  it('encontra o traço no meio de outras linhas de texto', () => {
    const lines = [{ text: 'Nome:' }, { text: '___________' }, { text: 'Cargo' }];
    expect(findTracoLineIndex(lines)).toBe(1);
  });

  it('cai para a linha 0 quando não há traço nenhum na célula', () => {
    const lines = [{ text: 'Sem traço aqui' }, { text: 'Outra linha' }];
    expect(findTracoLineIndex(lines)).toBe(0);
  });

  it('não confunde 1-2 underscores isolados com o traço da assinatura', () => {
    const lines = [{ text: 'a_b__c' }, { text: '___' }];
    expect(findTracoLineIndex(lines)).toBe(1);
  });
});

/** jsPDF mínimo — só o que renderTable chama. */
const fakePdf = () => ({
  addPage: vi.fn(),
  addImage: vi.fn(),
  setFontSize: vi.fn(),
  setFont: vi.fn(),
  setTextColor: vi.fn(),
  setFillColor: vi.fn(),
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  // Sem wrap: cada linha da célula dá uma linha desenhada.
  splitTextToSize: (t: string) => [t],
});

const ctx = (): TableCtx => ({
  pageHeight: 297,
  bottomMargin: 22,
  topMargin: 32,
  bg: null,
  compact: false,
});

const celula = (nLinhas: number): TableCellData => ({
  lines: Array.from({ length: nLinhas }, (_, i) => ({ text: `Cláusula ${i + 1}`, bold: false })),
  colspan: 1,
});

describe('renderTable — linha mais alta que a página', () => {
  it('parte a célula por várias páginas em vez de cortar o que passa da folha', () => {
    const pdf = fakePdf();
    const c = ctx();

    // Uma só linha de tabela com texto para muito mais do que uma A4 — é o
    // formato dos contratos, com o articulado todo dentro de uma célula.
    const rows: TableCellData[][] = [[celula(400)]];

    renderTable(pdf as unknown as jsPDF, rows, 20, c.topMargin, 170, false, c);

    expect(pdf.addPage).toHaveBeenCalled();

    // Nada pode ser desenhado fora da área útil da folha.
    const ys = pdf.text.mock.calls.map((call) => call[2] as number);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(c.topMargin);
    expect(Math.max(...ys)).toBeLessThanOrEqual(c.pageHeight - c.bottomMargin);

    // E nenhuma cláusula se perde pelo caminho.
    expect(pdf.text).toHaveBeenCalledTimes(400);
  });

  it('uma linha que cabe na folha continua a ser desenhada de uma vez', () => {
    const pdf = fakePdf();
    const c = ctx();

    renderTable(pdf as unknown as jsPDF, [[celula(10)]], 20, c.topMargin, 170, false, c);

    expect(pdf.addPage).not.toHaveBeenCalled();
    expect(pdf.text).toHaveBeenCalledTimes(10);
  });

  it('uma linha que não cabe no resto da folha passa inteira para a seguinte', () => {
    const pdf = fakePdf();
    const c = ctx();

    // Começa quase no fim da folha; a linha cabe numa página, mas não nesta.
    renderTable(pdf as unknown as jsPDF, [[celula(10)]], 20, 250, 170, false, c);

    expect(pdf.addPage).toHaveBeenCalledTimes(1);
    const ys = pdf.text.mock.calls.map((call) => call[2] as number);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(c.topMargin);
  });
});
