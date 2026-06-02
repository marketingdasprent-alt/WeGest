import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface LinhaNaoAssociado {
  nome: string;
  plataforma: string;
  faturado: number;
  transacoes: number;
}

interface Opcoes {
  linhas: LinhaNaoAssociado[];
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
 * PDF com a lista de motoristas de plataforma que ainda não têm ficha associada.
 * Colunas: # / Nome / Plataforma / Faturado / Transações.
 */
export function generateNaoAssociadosPDF({ linhas, logoSrc }: Opcoes): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;

  const cols: { label: string; w: number; align: 'left' | 'right' }[] = [
    { label: '#', w: 10, align: 'right' },
    { label: 'Motorista', w: 90, align: 'left' },
    { label: 'Plataforma', w: 28, align: 'left' },
    { label: 'Faturado', w: 30, align: 'right' },
    { label: 'Transações', w: 28, align: 'right' },
  ];
  const tableWidth = cols.reduce((s, c) => s + c.w, 0);

  let y = 14;

  const drawHeader = () => {
    if (logoSrc) {
      try {
        doc.addImage(logoSrc, 'PNG', marginX, y, 16, 11);
      } catch {
        /* ignore */
      }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Motoristas de plataforma sem ficha', marginX + 20, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt })} · ${linhas.length} motorista(s)`,
      marginX + 20,
      y + 10
    );
    doc.setTextColor(0);
    y += 18;
  };

  const drawTableHeader = () => {
    doc.setFillColor(217, 119, 6); // amber-600
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

  const rowH = 6;
  let totalFaturado = 0;

  linhas.forEach((l, idx) => {
    if (y + rowH > pageHeight - 18) {
      doc.addPage();
      y = 14;
      drawHeader();
      drawTableHeader();
      doc.setFontSize(9);
    }
    if (idx % 2 === 1) {
      doc.setFillColor(245, 245, 245);
      doc.rect(marginX, y, tableWidth, rowH, 'F');
    }
    let x = marginX;
    const vals = [String(idx + 1), l.nome, l.plataforma, fmt(l.faturado), String(l.transacoes)];
    cols.forEach((c, i) => {
      const tx = c.align === 'right' ? x + c.w - 2 : x + 2;
      let text = vals[i];
      if (i === 1 && doc.getTextWidth(text) > c.w - 4) {
        while (text.length > 4 && doc.getTextWidth(text + '…') > c.w - 4) text = text.slice(0, -1);
        text += '…';
      }
      doc.text(text, tx, y + 4, { align: c.align });
      x += c.w;
    });
    totalFaturado += l.faturado;
    y += rowH;
  });

  // Total
  if (y + 8 > pageHeight - 14) {
    doc.addPage();
    y = 14;
    drawHeader();
  }
  doc.setFillColor(217, 119, 6);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.rect(marginX, y, tableWidth, 8, 'F');
  let x = marginX;
  const totVals = ['', `TOTAL (${linhas.length})`, '', fmt(totalFaturado), ''];
  cols.forEach((c, i) => {
    const tx = c.align === 'right' ? x + c.w - 2 : x + 2;
    doc.text(totVals[i], tx, y + 5.5, { align: c.align });
    x += c.w;
  });
  doc.setTextColor(0);

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
