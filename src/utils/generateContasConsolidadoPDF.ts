import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface LinhaConsolidado {
  driver_name: string;
  total_faturado: number;
  aluguer: number;
  combustivel: number;
  outros_custos: number;
  reparacoes: number;
  liquido: number;
}

interface Opcoes {
  linhas: LinhaConsolidado[];
  weekStart: Date;
  weekEnd: Date;
  logoSrc?: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);

/**
 * Gera um único PDF (1+ páginas) com uma tabela consolidada dos motoristas
 * selecionados — Nome / Faturado / Aluguer / Combustível / Outros / Reparações / Líquido.
 */
export function generateContasConsolidadoPDF({
  linhas,
  weekStart,
  weekEnd,
  logoSrc,
}: Opcoes): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const marginY = 12;

  // Largura das colunas (mm) — total = pageWidth - 2*marginX = 277
  const cols: { label: string; w: number; align: 'left' | 'right' }[] = [
    { label: '#', w: 10, align: 'right' },
    { label: 'Motorista', w: 75, align: 'left' },
    { label: 'Faturado', w: 32, align: 'right' },
    { label: 'Aluguer', w: 28, align: 'right' },
    { label: 'Combustível', w: 32, align: 'right' },
    { label: 'Outros', w: 28, align: 'right' },
    { label: 'Reparações', w: 30, align: 'right' },
    { label: 'Líquido', w: 32, align: 'right' },
  ];
  const tableWidth = cols.reduce((s, c) => s + c.w, 0);

  let y = marginY;

  const drawHeader = () => {
    // Logo (opcional)
    if (logoSrc) {
      try {
        doc.addImage(logoSrc, 'PNG', marginX, y, 18, 12);
      } catch {
        /* ignora se não conseguir */
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Resumo Consolidado de Motoristas', marginX + 22, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const periodo = `${format(weekStart, 'dd/MM/yyyy', { locale: pt })} – ${format(weekEnd, 'dd/MM/yyyy', { locale: pt })}`;
    doc.text(`Período: ${periodo}`, marginX + 22, y + 11);

    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}`,
      pageWidth - marginX,
      y + 6,
      { align: 'right' }
    );
    doc.setTextColor(0);

    y += 18;
  };

  const drawTableHeader = () => {
    doc.setFillColor(15, 118, 110); // teal
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.rect(marginX, y, tableWidth, 8, 'F');

    let x = marginX;
    for (const c of cols) {
      const tx = c.align === 'right' ? x + c.w - 2 : x + 2;
      doc.text(c.label, tx, y + 5.5, { align: c.align });
      x += c.w;
    }
    y += 8;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
  };

  drawHeader();
  drawTableHeader();

  doc.setFontSize(9);
  const rowHeight = 6;
  let totFaturado = 0;
  let totAluguer = 0;
  let totCombustivel = 0;
  let totOutros = 0;
  let totReparacoes = 0;
  let totLiquido = 0;

  linhas.forEach((l, idx) => {
    if (y + rowHeight > pageHeight - 20) {
      // Nova página
      doc.addPage();
      y = marginY;
      drawHeader();
      drawTableHeader();
    }

    // Zebra
    if (idx % 2 === 1) {
      doc.setFillColor(245, 245, 245);
      doc.rect(marginX, y, tableWidth, rowHeight, 'F');
    }

    let x = marginX;
    const values = [
      String(idx + 1),
      l.driver_name,
      fmt(l.total_faturado),
      fmt(l.aluguer),
      fmt(l.combustivel),
      fmt(l.outros_custos),
      fmt(l.reparacoes),
      fmt(l.liquido),
    ];
    cols.forEach((c, i) => {
      const tx = c.align === 'right' ? x + c.w - 2 : x + 2;
      let text = values[i];
      // Truncar nome se necessário
      if (i === 1 && doc.getTextWidth(text) > c.w - 4) {
        while (text.length > 4 && doc.getTextWidth(text + '…') > c.w - 4) {
          text = text.slice(0, -1);
        }
        text += '…';
      }
      doc.text(text, tx, y + 4, { align: c.align });
      x += c.w;
    });

    totFaturado += l.total_faturado;
    totAluguer += l.aluguer;
    totCombustivel += l.combustivel;
    totOutros += l.outros_custos;
    totReparacoes += l.reparacoes;
    totLiquido += l.liquido;

    y += rowHeight;
  });

  // Totais
  if (y + 8 > pageHeight - 15) {
    doc.addPage();
    y = marginY;
    drawHeader();
  } else {
    y += 1;
  }

  doc.setFillColor(15, 118, 110);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.rect(marginX, y, tableWidth, 8, 'F');

  let x = marginX;
  const totVals = [
    '',
    `TOTAIS (${linhas.length})`,
    fmt(totFaturado),
    fmt(totAluguer),
    fmt(totCombustivel),
    fmt(totOutros),
    fmt(totReparacoes),
    fmt(totLiquido),
  ];
  cols.forEach((c, i) => {
    const tx = c.align === 'right' ? x + c.w - 2 : x + 2;
    doc.text(totVals[i], tx, y + 5.5, { align: c.align });
    x += c.w;
  });
  doc.setTextColor(0);

  // Rodapé com paginação
  const totalPages = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(130);
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - marginX, pageHeight - 6, {
      align: 'right',
    });
  }

  return doc;
}
