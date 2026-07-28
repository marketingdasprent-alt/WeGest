import type jsPDF from 'jspdf';
import type { RGB, TableCellData, TableCtx } from './types';

/**
 * Linha do traço "_______" onde a assinatura deve assentar. Localiza-se por
 * CONTEÚDO, nunca por posição — o placeholder {{assinatura_*}} pode vir antes
 * ou depois do traço consoante o template (ex.: "Contrato Aluguer" tem o
 * traço primeiro; "Folha de Danos" tem o placeholder primeiro). Assumir
 * sempre a 1.ª linha da célula ancorava a assinatura à linha errada nesse
 * segundo caso, deixando-a deslocada do traço.
 */
export function findTracoLineIndex(lines: Array<{ text: string }>): number {
  const idx = lines.findIndex((l) => /^_{3,}$/.test(l.text.trim()));
  return idx === -1 ? 0 : idx;
}

/**
 * Desenha uma tabela (vetorial) a partir de TableCellData[][]. Suporta:
 * larguras de coluna iguais (+ colspan), wrap de texto, alinhamento,
 * cor de fundo/texto, bordas (opcional) e quebra de página por linha.
 * Devolve o novo yPos.
 */
type WLine = { text: string; bold: boolean; color?: RGB; fs: number; h: number };
type CellLayout = { cell: TableCellData; cx: number; cw: number; wrapped: WLine[] };

export function renderTable(
  pdf: jsPDF,
  rows: TableCellData[][],
  x: number,
  yStart: number,
  totalW: number,
  bordered: boolean,
  ctx: TableCtx
): number {
  const pad = ctx.compact ? 1.4 : 2;
  const colCount = Math.max(1, ...rows.map((r) => r.reduce((s, c) => s + (c.colspan || 1), 0)));
  const colW = totalW / colCount;
  let y = yStart;

  const novaPagina = () => {
    pdf.addPage();
    if (ctx.bg) pdf.addImage(ctx.bg, 'PNG', 0, 0, 210, 297);
    y = ctx.topMargin;
  };

  /**
   * Desenha uma fatia de linha (fundo, borda, assinatura e texto) com a altura
   * indicada. `comAssinaturas` é falso nas fatias de uma linha partida por
   * várias páginas: a assinatura ancora no traço "____" dentro da célula
   * inteira e não faz sentido (nem cabe) numa fatia.
   */
  const desenharCelulas = (
    items: CellLayout[],
    yTopo: number,
    alturaFatia: number,
    comAssinaturas: boolean
  ) => {
    for (const cl of items) {
      if (cl.cell.bg) {
        pdf.setFillColor(cl.cell.bg[0], cl.cell.bg[1], cl.cell.bg[2]);
        pdf.rect(cl.cx, yTopo, cl.cw, alturaFatia, 'F');
      }
      if (bordered || cl.cell.bg) {
        pdf.setDrawColor(220, 222, 228);
        pdf.setLineWidth(0.2);
        pdf.rect(cl.cx, yTopo, cl.cw, alturaFatia, 'S');
      }
      // Assinatura: desenhada SOBRE a linha do traço "_______" (não
      // necessariamente a 1.ª linha da célula — ver findTracoLineIndex).
      const sigImg =
        comAssinaturas && cl.cell.signatureSrc
          ? ctx.signatures?.get(cl.cell.signatureSrc)
          : undefined;
      if (sigImg && sigImg.width > 0 && sigImg.height > 0) {
        const tracoIdx = findTracoLineIndex(cl.wrapped);
        let yAntesTraco = 0;
        for (let i = 0; i < tracoIdx; i++) yAntesTraco += cl.wrapped[i].h;
        const tracoLineH = cl.wrapped[tracoIdx]?.h ?? 4;
        const tracoBaselineY = yTopo + pad + yAntesTraco + tracoLineH * 0.82;
        const maxSigW = Math.min(cl.cw - pad * 2, 38);
        const maxSigH = Math.max(6, Math.min(12, tracoBaselineY - (yTopo + 0.5)));
        const aspect = sigImg.width / sigImg.height;
        let sw = maxSigW;
        let sh = sw / aspect;
        if (sh > maxSigH) {
          sh = maxSigH;
          sw = sh * aspect;
        }
        try {
          pdf.addImage(sigImg, 'PNG', cl.cx + pad, tracoBaselineY - sh, sw, sh);
        } catch (err) {
          console.warn('Falha a desenhar a assinatura na célula:', err);
        }
      }

      let lineY = yTopo + pad;
      cl.wrapped.forEach((ln) => {
        const col = ln.color ?? cl.cell.color ?? [30, 30, 35];
        pdf.setTextColor(col[0], col[1], col[2]);
        pdf.setFontSize(ln.fs);
        pdf.setFont('helvetica', ln.bold ? 'bold' : 'normal');
        let tx = cl.cx + pad;
        const opts: any = {};
        if (cl.cell.align === 'center') {
          tx = cl.cx + cl.cw / 2;
          opts.align = 'center';
        } else if (cl.cell.align === 'right') {
          tx = cl.cx + cl.cw - pad;
          opts.align = 'right';
        }
        pdf.text(ln.text, tx, lineY + ln.h * 0.82, opts);
        lineY += ln.h;
      });
    }
  };

  for (const row of rows) {
    const layout: CellLayout[] = [];
    let cx = x;
    let rowH = 0;
    for (const cell of row) {
      const span = cell.colspan || 1;
      const cw = colW * span;
      const baseFs = cell.fontSize || 9;
      const wrapped: WLine[] = [];
      let cellH = pad * 2;
      for (const ln of cell.lines.length ? cell.lines : [{ text: '', bold: false }]) {
        const fs = ln.fontSize || baseFs;
        if (!ln.text || !ln.text.trim()) {
          const gap = fs * 0.352777778 * (ctx.compact ? 0.5 : 0.6);
          wrapped.push({ text: '', bold: false, color: ln.color, fs, h: gap });
          cellH += gap;
          continue;
        }
        const lineH = fs * 0.352777778 * (ctx.compact ? 1.22 : 1.4);
        pdf.setFontSize(fs);
        pdf.setFont('helvetica', ln.bold ? 'bold' : 'normal');
        const parts = pdf.splitTextToSize(ln.text, cw - pad * 2);
        parts.forEach((p: string) => {
          wrapped.push({ text: p, bold: ln.bold, color: ln.color, fs, h: lineH });
          cellH += lineH;
        });
      }
      if (cellH > rowH) rowH = cellH;
      layout.push({ cell, cx, cw, wrapped });
      cx += cw;
    }

    const alturaUtilPagina = ctx.pageHeight - ctx.topMargin - ctx.bottomMargin;

    // Caso normal: a linha cabe numa folha — se não cabe NESTA, passa inteira
    // para a seguinte.
    if (rowH <= alturaUtilPagina) {
      if (y + rowH > ctx.pageHeight - ctx.bottomMargin) novaPagina();
      desenharCelulas(layout, y, rowH, true);
      y += rowH;
      continue;
    }

    // Linha mais alta que uma folha inteira (típico dos contratos com o texto
    // todo dentro de uma célula): parte-se por fatias, uma por página. Sem
    // isto a linha era desenhada de uma vez a partir da margem de topo e tudo
    // o que passasse do fim da folha era simplesmente cortado pelo jsPDF —
    // dava a sensação de o documento ter um limite intransponível.
    const porDesenhar: CellLayout[] = layout.map((cl) => ({ ...cl, wrapped: [...cl.wrapped] }));
    while (porDesenhar.some((cl) => cl.wrapped.length > 0)) {
      const disponivel = ctx.pageHeight - ctx.bottomMargin - y;

      const fatia = porDesenhar.map((cl) => {
        const levar: WLine[] = [];
        let altura = pad * 2;
        while (cl.wrapped.length > 0 && altura + cl.wrapped[0].h <= disponivel) {
          altura += cl.wrapped[0].h;
          levar.push(cl.wrapped.shift()!);
        }
        return { fatia: { ...cl, wrapped: levar }, altura };
      });

      const levouAlgo = fatia.some((f) => f.fatia.wrapped.length > 0);
      if (!levouAlgo) {
        // Nem uma linha cabe no que resta da folha — abrir a seguinte. Se nem
        // numa folha vazia couber (linha maior que a página útil), desiste
        // para não ficar em ciclo infinito.
        if (disponivel >= alturaUtilPagina) break;
        novaPagina();
        continue;
      }

      const alturaFatia = Math.max(...fatia.map((f) => f.altura));
      desenharCelulas(
        fatia.map((f) => f.fatia),
        y,
        alturaFatia,
        false
      );
      y += alturaFatia;

      if (porDesenhar.some((cl) => cl.wrapped.length > 0)) novaPagina();
    }
  }
  pdf.setTextColor(0, 0, 0);
  return y + 2;
}
