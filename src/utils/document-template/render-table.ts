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

  for (const row of rows) {
    type WLine = { text: string; bold: boolean; color?: RGB; fs: number; h: number };
    const layout: Array<{ cell: TableCellData; cx: number; cw: number; wrapped: WLine[] }> = [];
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

    // Quebra de página se a linha não couber
    if (y + rowH > ctx.pageHeight - ctx.bottomMargin) {
      pdf.addPage();
      if (ctx.bg) pdf.addImage(ctx.bg, 'PNG', 0, 0, 210, 297);
      y = ctx.topMargin;
    }

    // Desenhar células
    for (const cl of layout) {
      if (cl.cell.bg) {
        pdf.setFillColor(cl.cell.bg[0], cl.cell.bg[1], cl.cell.bg[2]);
        pdf.rect(cl.cx, y, cl.cw, rowH, 'F');
      }
      if (bordered || cl.cell.bg) {
        pdf.setDrawColor(220, 222, 228);
        pdf.setLineWidth(0.2);
        pdf.rect(cl.cx, y, cl.cw, rowH, 'S');
      }
      // Assinatura: desenhada SOBRE a linha do traço "_______" (não
      // necessariamente a 1.ª linha da célula — ver findTracoLineIndex).
      const sigImg = cl.cell.signatureSrc ? ctx.signatures?.get(cl.cell.signatureSrc) : undefined;
      if (sigImg && sigImg.width > 0 && sigImg.height > 0) {
        const tracoIdx = findTracoLineIndex(cl.wrapped);
        let yAntesTraco = 0;
        for (let i = 0; i < tracoIdx; i++) yAntesTraco += cl.wrapped[i].h;
        const tracoLineH = cl.wrapped[tracoIdx]?.h ?? 4;
        const tracoBaselineY = y + pad + yAntesTraco + tracoLineH * 0.82;
        const maxSigW = Math.min(cl.cw - pad * 2, 38);
        const maxSigH = Math.max(6, Math.min(12, tracoBaselineY - (y + 0.5)));
        const aspect = sigImg.width / sigImg.height;
        let sw = maxSigW;
        let sh = sw / aspect;
        if (sh > maxSigH) {
          sh = maxSigH;
          sw = sh * aspect;
        }
        const sx = cl.cx + pad;
        const sy = tracoBaselineY - sh;
        try {
          pdf.addImage(sigImg, 'PNG', sx, sy, sw, sh);
        } catch (err) {
          console.warn('Falha a desenhar a assinatura na célula:', err);
        }
      }

      let lineY = y + pad;
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
    y += rowH;
  }
  pdf.setTextColor(0, 0, 0);
  return y + 2;
}
