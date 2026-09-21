import type jsPDF from 'jspdf';
import { toast } from 'sonner';

const PRINT_IFRAME_ID = 'wegest-print-iframe';

export const printPdf = (pdf: jsPDF, fallbackFileName: string, hasLetterhead = false): void => {
  if (hasLetterhead) {
    toast.info(
      'No diálogo de impressão selecione Margens → Nenhuma (ou Mínimas) para o papel timbrado ficar sem bordas brancas.',
      { duration: 8000 }
    );
  }

  try {
    pdf.autoPrint();
    const blobUrl = String(pdf.output('bloburl'));

    document.getElementById(PRINT_IFRAME_ID)?.remove();

    const iframe = document.createElement('iframe');
    iframe.id = PRINT_IFRAME_ID;
    iframe.style.visibility = 'hidden';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (error) {
        console.warn('Falha ao disparar impressão via iframe:', error);
      }
    };

    iframe.src = blobUrl;
    document.body.appendChild(iframe);
  } catch (error) {
    console.error('Erro ao preparar impressão, a descarregar como alternativa:', error);
    pdf.save(fallbackFileName);
  }
};
