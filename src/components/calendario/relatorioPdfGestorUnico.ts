import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { formatMatricula } from './EventoCard';
import type { CalendarioEvento } from '@/pages/Calendario';
import {
  TIPOS_CONFIG,
  TIPO_LABELS,
  TIPO_COLORS_PDF,
  loadImageWithDimensions,
} from './relatorioDialog.constants';

export async function exportarPDFGestorUnico(params: {
  gestorId: string;
  totalPorGestor: { id: string; nome: string }[];
  eventosFiltrados: CalendarioEvento[];
  dataInicio: string;
  dataFim: string;
}): Promise<void> {
  const { gestorId, totalPorGestor, eventosFiltrados, dataInicio, dataFim } = params;
  const gestor = totalPorGestor.find((g) => g.id === gestorId);
  if (!gestor) return;

  const eventosDoGestor = eventosFiltrados.filter((ev) => ev.criado_por === gestorId);

  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const marginL = 14;
  const marginR = 14;

  const logoInfo = await loadImageWithDimensions('/Logo.png');

  // ── HEADER ──────────────────────────────────────────────
  const headerH = 44;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, headerH, 'F');

  doc.setFillColor(99, 102, 241);
  doc.rect(0, headerH - 2, pageW, 2, 'F');

  if (logoInfo) {
    try {
      const maxW = 55;
      const maxH = 26;
      const aspect = logoInfo.width / logoInfo.height;
      let logoW = maxW;
      let logoH = logoW / aspect;
      if (logoH > maxH) {
        logoH = maxH;
        logoW = logoH * aspect;
      }
      const logoX = marginL;
      const logoY = (headerH - logoH) / 2;
      doc.addImage(logoInfo.dataUrl, 'PNG', logoX, logoY, logoW, logoH);
    } catch {
      /* skip logo if error */
    }
  }

  doc.setTextColor(20, 20, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`Relatório - ${gestor.nome}`, pageW - marginR, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 110);
  doc.text('Calendário  ·  WeGest', pageW - marginR, 25, { align: 'right' });

  // ── STATS BAR ───────────────────────────────────────────
  const statsY = headerH;
  const statsH = 13;
  doc.setFillColor(244, 244, 245);
  doc.rect(0, statsY, pageW, statsH, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 70);
  const d1 = format(new Date(dataInicio + 'T00:00:00'), 'dd/MM/yyyy');
  const d2 = format(new Date(dataFim + 'T00:00:00'), 'dd/MM/yyyy');
  doc.text(`Período: ${d1}  —  ${d2}`, marginL, statsY + 8.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(99, 102, 241);
  doc.text(`${eventosDoGestor.length} evento(s)`, pageW - marginR, statsY + 8.5, {
    align: 'right',
  });

  // ── COLUMN HEADERS ──────────────────────────────────────
  let y = statsY + statsH;
  const colHeaderH = 9;
  doc.setFillColor(39, 39, 42);
  doc.rect(0, y, pageW, colHeaderH, 'F');

  doc.setTextColor(160, 160, 170);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const COL = { mat: marginL + 4, tipo: 112, data: 143, resp: pageW - marginR };
  doc.text('MATRÍCULA / CIDADE', COL.mat, y + 6);
  doc.text('TIPO', COL.tipo, y + 6);
  doc.text('DATA / HORA', COL.data, y + 6);
  doc.text('RESPONSÁVEL', COL.resp, y + 6, { align: 'right' });
  y += colHeaderH;

  // ── HELPERS ─────────────────────────────────────────────
  const rowPad = 3.5;
  const lineH = 5;
  const lineH2 = 4.2;
  const obsMaxW = COL.tipo - COL.mat - 2;
  const bodyMaxY = pageH - 12;

  const drawColHeaders = (atY: number) => {
    doc.setFillColor(39, 39, 42);
    doc.rect(0, atY, pageW, colHeaderH, 'F');
    doc.setTextColor(160, 160, 170);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('MATRÍCULA / CIDADE', COL.mat, atY + 6);
    doc.text('TIPO', COL.tipo, atY + 6);
    doc.text('DATA / HORA', COL.data, atY + 6);
    doc.text('RESPONSÁVEL', COL.resp, atY + 6, { align: 'right' });
    return atY + colHeaderH;
  };

  const drawFooter = (pageNum: number) => {
    doc.setFillColor(244, 244, 245);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 140);
    doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, marginL, pageH - 3.5);
    doc.text(`Página ${pageNum}`, pageW / 2, pageH - 3.5, { align: 'center' });
    doc.text('WeGest', pageW - marginR, pageH - 3.5, { align: 'right' });
  };

  // Pre-calculate row heights
  const rowHeights = eventosDoGestor.map((ev) => {
    let h = rowPad + lineH + lineH2;
    if (ev.descricao) {
      const lines = doc.splitTextToSize(`Obs: ${ev.descricao}`, obsMaxW);
      h += lines.length * 4;
    }
    return h + rowPad;
  });

  // ── DRAW ROWS ───────────────────────────────────────────
  let pageNum = 1;

  eventosDoGestor.forEach((ev, i) => {
    const rh = rowHeights[i];

    if (y + rh > bodyMaxY) {
      drawFooter(pageNum);
      doc.addPage();
      pageNum++;
      y = drawColHeaders(8);
    }

    // Row background
    if (i % 2 === 0) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(250, 250, 252);
    }
    doc.rect(0, y, pageW, rh, 'F');

    // Left color bar (tipo)
    const tc = TIPO_COLORS_PDF[ev.tipo] || [120, 120, 120];
    doc.setFillColor(tc[0], tc[1], tc[2]);
    doc.rect(0, y, 3, rh, 'F');

    const ty = y + rowPad + lineH;

    // Matrícula (bold, dark)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(20, 20, 25);
    const matricula =
      ev.tipo === 'lista_espera'
        ? ev.titulo
        : ev.tipo === 'troca'
          ? `${formatMatricula(ev.titulo)}${ev.matricula_devolver ? `  <>  ${formatMatricula(ev.matricula_devolver)}` : ''}`
          : formatMatricula(ev.titulo);
    const cidadeStr = ev.cidade ? `  ${ev.cidade.toUpperCase()}` : '';

    // Ensure matrícula doesn't overflow into tipo column
    const maxMatW = COL.tipo - COL.mat - 4;
    const matLines = doc.splitTextToSize(matricula + cidadeStr, maxMatW);
    doc.text(matLines[0], COL.mat, ty);
    if (matLines.length > 1) {
      doc.setFontSize(8);
      doc.text(matLines.slice(1).join(' '), COL.mat, ty + 3.5);
    }

    // Tipo (colored)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(tc[0], tc[1], tc[2]);
    doc.text(TIPO_LABELS[ev.tipo] || ev.tipo, COL.tipo, ty);

    // Data
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(50, 50, 60);
    const dataStr = format(
      new Date(ev.data_inicio),
      ev.dia_todo ? 'dd/MM/yyyy' : 'dd/MM/yy  HH:mm',
      { locale: pt }
    );
    doc.text(dataStr, COL.data, ty);

    // Responsável (right-aligned, truncated)
    if (ev.profiles?.nome) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 90);
      const respMaxW = pageW - marginR - COL.data - 30;
      const respLines = doc.splitTextToSize(ev.profiles.nome, respMaxW);
      doc.text(respLines[0], COL.resp, ty, { align: 'right' });
    }

    // Observações (wrapped, italic, muted)
    if (ev.descricao) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 120);
      const obsLines = doc.splitTextToSize(`Obs: ${ev.descricao}`, obsMaxW);
      obsLines.forEach((line: string, li: number) => {
        doc.text(line, COL.mat, ty + lineH2 + li * 4);
      });
    }

    // Bottom separator
    doc.setDrawColor(228, 228, 235);
    doc.setLineWidth(0.2);
    doc.line(0, y + rh, pageW, y + rh);

    y += rh;
  });

  drawFooter(pageNum);

  // ── RESUMO POR TIPO ───────────────────────────────────────
  const totaisTipo = TIPOS_CONFIG.map((t) => ({
    label: t.label,
    value: t.value,
    count: eventosDoGestor.filter((ev) => ev.tipo === t.value).length,
    color: TIPO_COLORS_PDF[t.value] || [120, 120, 120],
  })).filter((t) => t.count > 0);

  if (totaisTipo.length > 0) {
    doc.addPage();
    pageNum++;

    // Header faixa
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, 'F');
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, pageW, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('RESUMO  ·  TOTAL POR TIPO DE EVENTO', marginL, 6.5);

    // Título
    let gy = 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20, 20, 25);
    doc.text('Total por Tipo de Evento', marginL, gy);
    gy += 3;
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.6);
    doc.line(marginL, gy, marginL + 60, gy);
    gy += 8;

    // Período
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 110);
    const d1 = format(new Date(dataInicio + 'T00:00:00'), 'dd/MM/yyyy');
    const d2 = format(new Date(dataFim + 'T00:00:00'), 'dd/MM/yyyy');
    doc.text(
      `Período: ${d1} — ${d2}   ·   ${eventosDoGestor.length} evento(s) no total`,
      marginL,
      gy
    );
    gy += 12;

    // ── Barras horizontais ──────────────────────────────────
    const maxCount = Math.max(...totaisTipo.map((t) => t.count));
    const barMaxW = pageW - marginL - marginR - 40;
    const barH = 10;
    const barGap = 7;
    const labelW = 38;
    const barStartX = marginL + labelW + 2;

    totaisTipo.forEach((t) => {
      const barW = maxCount > 0 ? (t.count / maxCount) * barMaxW : 0;
      const [r, g, b] = t.color;

      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(40, 40, 50);
      doc.text(t.label, marginL + labelW, gy + barH / 2 + 2.5, { align: 'right' });

      // Background track
      doc.setFillColor(240, 240, 245);
      doc.roundedRect(barStartX, gy, barMaxW, barH, 2, 2, 'F');

      // Colored bar
      if (barW > 0) {
        doc.setFillColor(r, g, b);
        doc.roundedRect(barStartX, gy, barW, barH, 2, 2, 'F');
      }

      // Count inside / beside bar
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const countX = barStartX + barW + 3;
      doc.setTextColor(r, g, b);
      doc.text(String(t.count), countX, gy + barH / 2 + 2.5);

      gy += barH + barGap;
    });

    gy += 10;

    // ── Tabela resumo ───────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 25);
    doc.text('Resumo', marginL, gy);
    gy += 6;

    const colTipo = marginL;
    const colQtd = marginL + 70;
    const colPct = marginL + 100;

    // Cabeçalho tabela
    doc.setFillColor(39, 39, 42);
    doc.rect(marginL - 2, gy - 4, pageW - marginL - marginR + 4, 8, 'F');
    doc.setTextColor(200, 200, 210);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('TIPO', colTipo, gy);
    doc.text('TOTAL', colQtd, gy);
    doc.text('% DO PERÍODO', colPct, gy);
    gy += 6;

    totaisTipo.forEach((t, i) => {
      const pct =
        eventosDoGestor.length > 0 ? ((t.count / eventosDoGestor.length) * 100).toFixed(1) : '0.0';

      if (i % 2 === 0) {
        doc.setFillColor(248, 248, 252);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(marginL - 2, gy - 3.5, pageW - marginL - marginR + 4, 7, 'F');

      // Dot color
      const [r, g, b] = t.color;
      doc.setFillColor(r, g, b);
      doc.circle(colTipo + 1.5, gy - 0.5, 1.5, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(40, 40, 50);
      doc.text(t.label, colTipo + 5, gy);
      doc.text(String(t.count), colQtd, gy);

      doc.setTextColor(100, 100, 110);
      doc.text(`${pct}%`, colPct, gy);

      gy += 7;
    });

    // Total row
    doc.setFillColor(230, 230, 240);
    doc.rect(marginL - 2, gy - 3.5, pageW - marginL - marginR + 4, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(20, 20, 25);
    doc.text('TOTAL', colTipo, gy);
    doc.text(String(eventosDoGestor.length), colQtd, gy);
    doc.text('100%', colPct, gy);

    drawFooter(pageNum);
  }

  const pdfUrl = doc.output('bloburl');
  window.open(pdfUrl, '_blank');
}
