import { describe, expect, it, vi } from 'vitest';
import type jsPDF from 'jspdf';
import { renderHtmlBlock, type RenderHtmlBlockCtx } from './render-html-block';

/** jsPDF mínimo — só o que renderHtmlBlock chama para texto e quebras. */
const fakePdf = () => ({
  addPage: vi.fn(),
  addImage: vi.fn(),
  setFontSize: vi.fn(),
  setFont: vi.fn(),
  setTextColor: vi.fn(),
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  line: vi.fn(),
  text: vi.fn(),
  getTextWidth: (t: string) => t.length * 2,
});

const ctx = (): RenderHtmlBlockCtx => ({
  leftMargin: 20,
  rightMargin: 20,
  topMargin: 32,
  pageWidth: 210,
  pageHeight: 297,
  bottomMargin: 22,
  maxWidth: 170,
  lineFactor: 1.5,
  hasLetterhead: false,
  bg: null,
  signatures: new Map(),
});

const QUEBRA = '<div data-page-break="true" class="page-break"></div>';

describe('renderHtmlBlock — quebra de página manual', () => {
  it('cria uma folha nova e recomeça na margem de topo', async () => {
    const pdf = fakePdf();
    const c = ctx();

    const yFinal = await renderHtmlBlock(
      pdf as unknown as jsPDF,
      `<p>Antes.</p>${QUEBRA}<p>Depois.</p>`,
      c.topMargin,
      c
    );

    expect(pdf.addPage).toHaveBeenCalledTimes(1);
    // A folha nova arranca sempre no topo — não continua onde o texto ia.
    expect(pdf.text).toHaveBeenCalledWith('Depois.', expect.anything(), c.topMargin);
    // Sai perto do topo (só o avanço da própria linha), não no fundo da folha.
    expect(yFinal).toBeLessThan(c.topMargin + 10);
  });

  it('não cria folha em branco quando a quebra fica no fim do template', async () => {
    const pdf = fakePdf();
    const c = ctx();

    // O TipTap deixa quase sempre um parágrafo vazio a seguir a um nó atómico.
    await renderHtmlBlock(
      pdf as unknown as jsPDF,
      `<p>Único conteúdo.</p>${QUEBRA}<p></p><p>&nbsp;</p>`,
      c.topMargin,
      c
    );

    expect(pdf.addPage).not.toHaveBeenCalled();
  });

  it('repõe o papel timbrado na folha criada pela quebra', async () => {
    const pdf = fakePdf();
    const c = { ...ctx(), bg: {} as HTMLImageElement, hasLetterhead: true };

    await renderHtmlBlock(
      pdf as unknown as jsPDF,
      `<p>Antes.</p>${QUEBRA}<p>Depois.</p>`,
      c.topMargin,
      c
    );

    expect(pdf.addImage).toHaveBeenCalledWith(c.bg, 'PNG', 0, 0, 210, 297);
  });

  it('encher a folha de linhas em branco empurra para a folha seguinte', async () => {
    const pdf = fakePdf();
    const c = ctx();

    // Muito mais linhas em branco do que cabem numa A4 — era aqui que o yPos
    // passava o fim da folha sem nunca criar página nova.
    const vazias = '<p></p>'.repeat(80);

    await renderHtmlBlock(
      pdf as unknown as jsPDF,
      `<p>Topo.</p>${vazias}<p>Depois do espaço.</p>`,
      c.topMargin,
      c
    );

    expect(pdf.addPage).toHaveBeenCalled();
    // E o texto tem de acabar dentro da área útil, nunca fora da folha.
    const ysDesenhados = pdf.text.mock.calls.map((call) => call[2] as number);
    expect(Math.max(...ysDesenhados)).toBeLessThanOrEqual(c.pageHeight - c.bottomMargin);
  });

  it('um parágrafo que já não cabe começa na folha seguinte', async () => {
    const pdf = fakePdf();
    const c = ctx();

    // Arranca a 5mm do limite inferior: nem uma linha cabe.
    await renderHtmlBlock(
      pdf as unknown as jsPDF,
      '<p>Não cabe aqui.</p>',
      c.pageHeight - c.bottomMargin - 1,
      c
    );

    expect(pdf.addPage).toHaveBeenCalledTimes(1);
    // O renderer desenha palavra a palavra; todas têm de sair na margem de topo
    // da folha nova, nenhuma no fundo da anterior.
    const ysDesenhados = pdf.text.mock.calls.map((call) => call[2] as number);
    expect(ysDesenhados.length).toBeGreaterThan(0);
    expect(ysDesenhados.every((y) => y === c.topMargin)).toBe(true);
  });

  it('um contrato inteiro com papel timbrado não perde uma única linha', async () => {
    const pdf = fakePdf();
    // Definições reais do template "Contrato de Aluger": timbrado, topo 44,
    // fundo 10, entrelinha comprimida.
    const c: RenderHtmlBlockCtx = {
      ...ctx(),
      hasLetterhead: true,
      bg: {} as HTMLImageElement,
      topMargin: 44,
      bottomMargin: 10,
      lineFactor: 1.24,
    };

    // ~8000 caracteres de articulado, como o contrato real.
    const clausulas = Array.from(
      { length: 60 },
      (_, i) =>
        `<p>${i + 1}. O LOCATÁRIO obriga-se a fazer um uso normal e prudente do veículo, ` +
        'cumprindo a Lei, em especial o Código da Estrada, assegurando-se que o veículo ' +
        'fica devidamente parqueado em local seguro e fechado à chave.</p>'
    ).join('');

    await renderHtmlBlock(pdf as unknown as jsPDF, clausulas, c.topMargin, c);

    const ys = pdf.text.mock.calls.map((call) => call[2] as number);
    expect(ys.length).toBeGreaterThan(0);
    // Nem uma palavra acima da margem de topo nem abaixo da inferior.
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(c.topMargin);
    expect(Math.max(...ys)).toBeLessThanOrEqual(c.pageHeight - c.bottomMargin);
    // E o timbrado tem de ser recarimbado em cada folha nova.
    expect(pdf.addImage).toHaveBeenCalledTimes(pdf.addPage.mock.calls.length);
  });

  it('duas quebras dão duas folhas novas', async () => {
    const pdf = fakePdf();
    const c = ctx();

    await renderHtmlBlock(
      pdf as unknown as jsPDF,
      `<p>Um.</p>${QUEBRA}<p>Dois.</p>${QUEBRA}<p>Três.</p>`,
      c.topMargin,
      c
    );

    expect(pdf.addPage).toHaveBeenCalledTimes(2);
  });
});
