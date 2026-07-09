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

export async function exportarPDFPorGestor(params: {
  eventosFiltrados: CalendarioEvento[];
  dataInicio: string;
  dataFim: string;
}): Promise<void> {
  const { eventosFiltrados, dataInicio, dataFim } = params;
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const marginL = 14;
  const marginR = 14;

  const logoInfo = await loadImageWithDimensions('/Logo.png');

  const drawHeader = () => {
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
        let lw = maxW;
        let lh = lw / aspect;
        if (lh > maxH) {
          lh = maxH;
          lw = lh * aspect;
        }
        doc.addImage(logoInfo.dataUrl, 'PNG', marginL, (headerH - lh) / 2, lw, lh);
      } catch {
        /* skip */
      }
    }

    doc.setTextColor(20, 20, 25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Relatório por Gestor', pageW - marginR, 18, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 110);
    doc.text('Calendário  ·  WeGest', pageW - marginR, 25, { align: 'right' });

    return headerH;
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

  // Agrupar por gestor
  const gestores = Array.from(
    new Map(eventosFiltrados.map((ev) => [ev.criado_por, ev.profiles?.nome || 'Desconhecido']))
  )
    .map(([id, nome]) => ({
      id,
      nome,
      eventos: eventosFiltrados.filter((ev) => ev.criado_por === id),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const d1 = format(new Date(dataInicio + 'T00:00:00'), 'dd/MM/yyyy');
  const d2 = format(new Date(dataFim + 'T00:00:00'), 'dd/MM/yyyy');

  let headerH = drawHeader();
  let pageNum = 1;

  // Stats bar
  const statsH = 13;
  doc.setFillColor(244, 244, 245);
  doc.rect(0, headerH, pageW, statsH, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 70);
  doc.text(`Período: ${d1}  —  ${d2}`, marginL, headerH + 8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(99, 102, 241);
  doc.text(
    `${eventosFiltrados.length} evento(s)  ·  ${gestores.length} gestor(es)`,
    pageW - marginR,
    headerH + 8.5,
    { align: 'right' }
  );

  let y = headerH + statsH + 4;
  const bodyMaxY = pageH - 14;

  const COL = { mat: marginL + 4, tipo: 112, data: 145, resp: pageW - marginR };
  const colHeaderH = 8;

  const drawColHeaders = (atY: number) => {
    doc.setFillColor(39, 39, 42);
    doc.rect(0, atY, pageW, colHeaderH, 'F');
    doc.setTextColor(160, 160, 170);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('MATRÍCULA / MODELO', COL.mat, atY + 5.5);
    doc.text('TIPO', COL.tipo, atY + 5.5);
    doc.text('DATA', COL.data, atY + 5.5);
    return atY + colHeaderH;
  };

  for (const gestor of gestores) {
    // Section header height
    const sectionH = 11;
    if (y + sectionH + 20 > bodyMaxY) {
      drawFooter(pageNum);
      doc.addPage();
      pageNum++;
      headerH = drawHeader();
      y = headerH + 6;
    }

    // Gestor section header
    doc.setFillColor(99, 102, 241);
    doc.rect(0, y, pageW, sectionH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(gestor.nome, marginL, y + 7.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${gestor.eventos.length} evento(s)`, pageW - marginR, y + 7.5, {
      align: 'right',
    });
    y += sectionH;

    y = drawColHeaders(y);

    gestor.eventos.forEach((ev, i) => {
      const rowH = 8;
      if (y + rowH > bodyMaxY) {
        drawFooter(pageNum);
        doc.addPage();
        pageNum++;
        headerH = drawHeader();
        y = drawColHeaders(headerH + 4);
      }

      doc.setFillColor(i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
      doc.rect(0, y, pageW, rowH, 'F');

      const tc = TIPO_COLORS_PDF[ev.tipo] || [120, 120, 120];
      doc.setFillColor(tc[0], tc[1], tc[2]);
      doc.rect(0, y, 3, rowH, 'F');

      const ty = y + 5.5;
      const titulo =
        ev.tipo === 'lista_espera' || ev.tipo === 'slot'
          ? ev.titulo
          : ev.tipo === 'troca'
            ? `${formatMatricula(ev.titulo)}${ev.matricula_devolver ? ` ↔ ${formatMatricula(ev.matricula_devolver)}` : ''}`
            : formatMatricula(ev.titulo);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(20, 20, 25);
      doc.text(titulo + (ev.cidade ? `  ${ev.cidade.toUpperCase()}` : ''), COL.mat, ty);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(tc[0], tc[1], tc[2]);
      doc.text(TIPO_LABELS[ev.tipo] || ev.tipo, COL.tipo, ty);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 70);
      doc.text(
        format(new Date(ev.data_inicio), ev.dia_todo ? 'dd/MM/yyyy' : 'dd/MM/yy HH:mm', {
          locale: pt,
        }),
        COL.data,
        ty
      );

      doc.setDrawColor(228, 228, 235);
      doc.setLineWidth(0.15);
      doc.line(0, y + rowH, pageW, y + rowH);
      y += rowH;
    });

    // Subtotal row
    doc.setFillColor(230, 230, 240);
    doc.rect(0, y, pageW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 80);
    doc.text(`Subtotal: ${gestor.eventos.length} evento(s)`, pageW - marginR, y + 5, {
      align: 'right',
    });
    y += 7 + 6;
  }

  drawFooter(pageNum);

  // ── Página de resumo ─────────────────────────────────────
  doc.addPage();
  pageNum++;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 0, pageW, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('RESUMO  ·  TOTAL POR GESTOR', marginL, 6.5);

  let gy = 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 25);
  doc.text('Total por Gestor', marginL, gy);
  gy += 3;
  doc.setDrawColor(99, 102, 241);
  doc.setLineWidth(0.6);
  doc.line(marginL, gy, marginL + 50, gy);
  gy += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 110);
  doc.text(`Período: ${d1} — ${d2}   ·   ${eventosFiltrados.length} evento(s)`, marginL, gy);
  gy += 12;

  const maxCount = Math.max(...gestores.map((g) => g.eventos.length));
  const barMaxW = pageW - marginL - marginR - 50;
  const barH = 10;
  const barGap = 6;
  const labelW = 48;
  const barStartX = marginL + labelW + 2;

  // Paleta de cores para gestores
  const gestorColors: [number, number, number][] = [
    [99, 102, 241],
    [34, 197, 94],
    [249, 115, 22],
    [168, 85, 247],
    [59, 130, 246],
    [234, 179, 8],
    [236, 72, 153],
    [20, 184, 166],
    [239, 68, 68],
  ];

  gestores.forEach((g, idx) => {
    if (gy + barH > pageH - 50) return; // segurança
    const barW = maxCount > 0 ? (g.eventos.length / maxCount) * barMaxW : 0;
    const [r, gc2, b] = gestorColors[idx % gestorColors.length];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 50);
    const labelLines = doc.splitTextToSize(g.nome, labelW - 2);
    doc.text(labelLines[0], marginL + labelW, gy + barH / 2 + 2.5, { align: 'right' });

    doc.setFillColor(240, 240, 245);
    doc.roundedRect(barStartX, gy, barMaxW, barH, 2, 2, 'F');
    if (barW > 0) {
      doc.setFillColor(r, gc2, b);
      doc.roundedRect(barStartX, gy, barW, barH, 2, 2, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(r, gc2, b);
    doc.text(String(g.eventos.length), barStartX + barW + 3, gy + barH / 2 + 2.5);
    gy += barH + barGap;
  });

  gy += 10;

  // Tabela matriz: Gestor × Tipo (entregas, devoluções, etc. por gestor)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 25);
  doc.text('Resumo por Gestor e Tipo', marginL, gy);
  gy += 6;

  const tiposPdf = TIPOS_CONFIG.filter((t) => eventosFiltrados.some((ev) => ev.tipo === t.value));
  const cGestor = marginL;
  const cTotal = pageW - marginR; // alinhado à direita
  const gestorW = 56;
  const totalW = 16;
  const tiposX0 = marginL + gestorW;
  const tiposW = cTotal - totalW - tiposX0;
  const colW = tiposPdf.length > 0 ? tiposW / tiposPdf.length : 0;
  const tipoX = (idx: number) => tiposX0 + idx * colW + colW / 2;

  doc.setFillColor(39, 39, 42);
  doc.rect(marginL - 2, gy - 4, pageW - marginL - marginR + 4, 8, 'F');
  doc.setTextColor(200, 200, 210);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('GESTOR', cGestor, gy);
  tiposPdf.forEach((t, idx) => {
    doc.text((t.label || t.value).toUpperCase(), tipoX(idx), gy, { align: 'center' });
  });
  doc.text('TOTAL', cTotal, gy, { align: 'right' });
  gy += 6;

  gestores.forEach((g, i) => {
    if (gy > pageH - 18) return; // segurança de página
    const [r, gc2, b] = gestorColors[i % gestorColors.length];

    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 252 : 255);
    doc.rect(marginL - 2, gy - 3.5, pageW - marginL - marginR + 4, 7, 'F');

    doc.setFillColor(r, gc2, b);
    doc.circle(cGestor + 1.5, gy - 0.5, 1.5, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 50);
    const nomeLines = doc.splitTextToSize(g.nome, gestorW - 6);
    doc.text(nomeLines[0], cGestor + 5, gy);

    tiposPdf.forEach((t, idx) => {
      const c = g.eventos.filter((ev) => ev.tipo === t.value).length;
      if (c > 0) {
        doc.setTextColor(40, 40, 50);
        doc.text(String(c), tipoX(idx), gy, { align: 'center' });
      } else {
        doc.setTextColor(190, 190, 195);
        doc.text('·', tipoX(idx), gy, { align: 'center' });
      }
    });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 25);
    doc.text(String(g.eventos.length), cTotal, gy, { align: 'right' });
    gy += 7;
  });

  doc.setFillColor(230, 230, 240);
  doc.rect(marginL - 2, gy - 3.5, pageW - marginL - marginR + 4, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 25);
  doc.text('TOTAL', cGestor, gy);
  tiposPdf.forEach((t, idx) => {
    const c = eventosFiltrados.filter((ev) => ev.tipo === t.value).length;
    doc.text(String(c), tipoX(idx), gy, { align: 'center' });
  });
  doc.text(String(eventosFiltrados.length), cTotal, gy, { align: 'right' });

  drawFooter(pageNum);

  window.open(doc.output('bloburl'), '_blank');
}
