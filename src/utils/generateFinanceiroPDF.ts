import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface FinanceiroPDFData {
  driver_name: string;
  matricula: string | null;
  cartaoFrota: string | null;
  dateRange: { from: Date; to: Date };
  recibo_verde: boolean;
  receitas: {
    bolt: number;
    uber: number;
    outras_receitas: number;
    /** Gorjeta Bolt+Uber já somada ao `total` — nunca sofre divisão de recibo verde. */
    gorjeta?: number;
    total: number;
  };
  despesas: {
    aluguer: number;
    combustivel: number;
    portagens: number;
    reparacoes: number;
    outros: number;
    total: number;
  };
  resumo: {
    totalAReceber: number;
    ajuste?: number;
    liquido: number;
  };
  logoSrc?: string;
}

export const generateFinanceiroPDF = async (
  data: FinanceiroPDFData,
  existingPdf?: jsPDF
): Promise<jsPDF> => {
  const pdf =
    existingPdf ||
    new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

  if (existingPdf) {
    pdf.addPage();
  }

  const pageWidth = pdf.internal.pageSize.getWidth();
  const leftMargin = 20;
  const rightMargin = 20;
  const maxWidth = pageWidth - leftMargin - rightMargin;
  let yPos = 20;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  // 1. Cabeçalho com Logo
  if (data.logoSrc) {
    try {
      pdf.addImage(data.logoSrc, 'PNG', (pageWidth - 40) / 2, yPos, 40, 40);
      yPos += 45;
    } catch (e) {
      console.warn('Erro ao carregar logo no PDF', e);
      yPos += 10;
    }
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('RESUMO FINANCEIRO DO MOTORISTA', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // 2. Informações Gerais
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setFillColor(245, 245, 245);
  pdf.rect(leftMargin, yPos, maxWidth, 30, 'F');

  let infoY = yPos + 7;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Motorista:', leftMargin + 5, infoY);
  pdf.setFont('helvetica', 'normal');
  pdf.text(data.driver_name, leftMargin + 25, infoY);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Período:', leftMargin + 100, infoY);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `${format(data.dateRange.from, 'dd/MM/yyyy')} a ${format(data.dateRange.to, 'dd/MM/yyyy')}`,
    leftMargin + 118,
    infoY
  );

  infoY += 7;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Matrícula:', leftMargin + 5, infoY);
  pdf.setFont('helvetica', 'normal');
  pdf.text(data.matricula || 'N/A', leftMargin + 25, infoY);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Recibo Verde:', leftMargin + 100, infoY);
  pdf.setFont('helvetica', 'normal');
  pdf.text(data.recibo_verde ? 'Sim' : 'Não', leftMargin + 128, infoY);

  infoY += 7;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Cartão:', leftMargin + 5, infoY);
  pdf.setFont('helvetica', 'normal');
  pdf.text(data.cartaoFrota || 'N/A', leftMargin + 25, infoY);

  yPos += 35;

  // 3. Tabela de Receitas e Despesas
  const col1Width = maxWidth / 2 - 5;
  const col2X = leftMargin + col1Width + 10;
  const startYTable = yPos;

  // --- RECEITAS ---
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(34, 197, 94); // Green-600
  pdf.text('RECEITAS', leftMargin, yPos);
  yPos += 7;
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');

  const rowsReceitas = [
    ['Bolt', formatCurrency(data.receitas.bolt)],
    ['Uber', formatCurrency(data.receitas.uber)],
    ['Outras', formatCurrency(data.receitas.outras_receitas)],
  ];

  rowsReceitas.forEach(([label, val]) => {
    pdf.text(label, leftMargin, yPos);
    pdf.text(val, leftMargin + col1Width, yPos, { align: 'right' });
    yPos += 6;
  });

  pdf.line(leftMargin, yPos - 3, leftMargin + col1Width, yPos - 3);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TOTAL RECEITAS', leftMargin, yPos);
  pdf.text(formatCurrency(data.receitas.total), leftMargin + col1Width, yPos, { align: 'right' });

  // --- DESPESAS ---
  let yPosDespesas = startYTable;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(220, 38, 38); // Red-600
  pdf.text('DESPESAS', col2X, yPosDespesas);
  yPosDespesas += 7;
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');

  const rowsDespesas = [
    ['Aluguer', formatCurrency(data.despesas.aluguer)],
    ['Combustível', formatCurrency(data.despesas.combustivel)],
    ['Portagens', formatCurrency(data.despesas.portagens)],
    ['Reparações', formatCurrency(data.despesas.reparacoes)],
    ['Outros', formatCurrency(data.despesas.outros)],
  ];

  rowsDespesas.forEach(([label, val]) => {
    pdf.text(label, col2X, yPosDespesas);
    pdf.text(val, col2X + col1Width, yPosDespesas, { align: 'right' });
    yPosDespesas += 6;
  });

  pdf.line(col2X, yPosDespesas - 3, col2X + col1Width, yPosDespesas - 3);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TOTAL DESPESAS', col2X, yPosDespesas);
  pdf.text(formatCurrency(data.despesas.total), col2X + col1Width, yPosDespesas, {
    align: 'right',
  });

  yPos = Math.max(yPos, yPosDespesas) + 15;

  // 4. Resumo Final
  pdf.setFillColor(240, 249, 255); // Blue-50
  pdf.rect(leftMargin, yPos, maxWidth, 25, 'F');

  yPos += 8;
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text('TOTAL A RECEBER:', leftMargin + 5, yPos);
  pdf.text(formatCurrency(data.resumo.totalAReceber), leftMargin + maxWidth - 5, yPos, {
    align: 'right',
  });

  if (data.resumo.ajuste) {
    yPos += 7;
    pdf.setFontSize(10);
    pdf.setTextColor(234, 88, 12); // Orange-600
    pdf.text('AJUSTE (S/ RECIBO VERDE):', leftMargin + 5, yPos);
    pdf.text(`-${formatCurrency(data.resumo.ajuste)}`, leftMargin + maxWidth - 5, yPos, {
      align: 'right',
    });
  }

  yPos += 10;
  pdf.setFontSize(14);
  pdf.setTextColor(30, 64, 175); // Blue-800
  pdf.setFont('helvetica', 'bold');
  pdf.text('VALOR LÍQUIDO FINAL:', leftMargin + 5, yPos);
  pdf.text(formatCurrency(data.resumo.liquido), leftMargin + maxWidth - 5, yPos, {
    align: 'right',
  });

  // 5. Rodapé
  yPos = 270;
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(156, 163, 175); // Gray-400
  pdf.text(
    `Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}`,
    pageWidth / 2,
    yPos,
    { align: 'center' }
  );
  pdf.text('WeGest, Lda. • NIF: 515127850', pageWidth / 2, yPos + 4, { align: 'center' });

  return pdf;
};
