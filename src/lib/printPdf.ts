import type jsPDF from 'jspdf';
import { toast } from 'sonner';

const PRINT_IFRAME_ID = 'wegest-print-iframe';

/**
 * Imprime um PDF (jsPDF) abrindo a caixa de impressão do browser, sem abrir
 * uma aba nova e sem fazer download.
 *
 * Porquê iframe e não `window.open`: os browsers só permitem abrir janelas/abas
 * novas imediatamente a seguir ao clique do utilizador. Como a geração do PDF
 * passa por operações assíncronas (queries ao Supabase, carregamento do papel
 * timbrado), o `window.open` perde o contexto do clique e é bloqueado — mesmo
 * com pop-ups permitidos —, caindo no download. Um iframe escondido não tem
 * essa limitação e dispara a impressão de forma fiável.
 *
 * Se a impressão falhar por algum motivo, faz fallback para download para não
 * perder o documento.
 *
 * @param hasLetterhead  true quando o PDF usa papel timbrado — mostra aviso
 *                       para o utilizador definir "Margens: Nenhuma" no diálogo
 *                       de impressão, caso contrário o browser adiciona bordas
 *                       brancas à volta da imagem de fundo.
 */
export const printPdf = (
  pdf: jsPDF,
  fallbackFileName: string,
  hasLetterhead = false,
): void => {
  if (hasLetterhead) {
    toast.info(
      'No diálogo de impressão selecione Margens → Nenhuma (ou Mínimas) para o papel timbrado ficar sem bordas brancas.',
      { duration: 8000 },
    );
  }

  try {
    // autoPrint embebe a acção de impressão no próprio PDF (fallback do iframe).
    pdf.autoPrint();
    const blobUrl = String(pdf.output('bloburl'));

    // Reutilizar um único iframe: remover o anterior antes de criar o novo.
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
        // Se a impressão programática falhar, o autoPrint embebido trata disso.
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
