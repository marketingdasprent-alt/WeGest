import jsPDF from 'jspdf';
import type { AcordoDetalhe, ParcelaDetalhe } from '@/hooks/useAcordoDetalhe';

const eur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
const dataPT = (iso: string) => iso.split('-').reverse().join('/');

/**
 * PDF de uma única página para o Aviso de Vencimento — NÃO é documento fiscal (dito
 * explicitamente no próprio PDF, mesma linguagem do email que o worker diário já envia).
 * Gerado no browser, por acção do staff, para poder ser reencaminhado a um contabilista.
 * Modelado em generateFinanceiroPDF.ts (jsPDF simples, sem template/HTML, sem
 * jspdf-autotable — este repo não tem essa dependência).
 */
export function gerarAvisoVencimentoPdf(acordo: AcordoDetalhe, parcela: ParcelaDetalhe): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = 20;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('AVISO DE VENCIMENTO', pageWidth / 2, y, { align: 'center' });
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Este documento não é fatura nem recibo — não tem valor fiscal.', pageWidth / 2, y, {
    align: 'center',
  });
  y += 12;

  pdf.setFontSize(11);
  pdf.text(`Acordo ACD-${acordo.codigo}`, 20, y);
  y += 7;
  pdf.text(`Responsável: ${acordo.responsavelNome}`, 20, y);
  y += 7;
  pdf.text(`Parcela ${parcela.numero} de ${acordo.parcelas.length}`, 20, y);
  y += 10;

  pdf.setLineWidth(0.2);
  pdf.line(20, y, pageWidth - 20, y);
  y += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Valor:', 20, y);
  pdf.text(eur(parcela.valor), pageWidth - 20, y, { align: 'right' });
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.text('Data de vencimento:', 20, y);
  pdf.text(dataPT(parcela.dataVencimento), pageWidth - 20, y, { align: 'right' });
  y += 7;
  pdf.text('Falta pagar (total do acordo):', 20, y);
  pdf.text(eur(acordo.faltaPagar), pageWidth - 20, y, { align: 'right' });
  y += 12;

  pdf.setFontSize(8);
  pdf.setTextColor(120);
  pdf.text(
    `Emitido em ${new Date().toLocaleDateString('pt-PT')} — documento gerado localmente, sem valor fiscal.`,
    20,
    y
  );

  return pdf;
}
