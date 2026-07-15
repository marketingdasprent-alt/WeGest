import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { printPdf } from '@/lib/printPdf';
import { fetchAnexoDanos } from '@/utils/fetchAnexoDanos';
import type {
  DocumentTemplate,
  GenerateDocumentParams,
  DocumentoCombinado,
  AnexoDanos,
} from './types';
import { replaceDynamicFields, loadImage, htmlToText } from './parser';
import { renderHtmlBlock, type RenderHtmlBlockCtx } from './render-html-block';
import { renderAnexoDanos, type AnexoDanosCtx } from './render-anexo-danos';

/**
 * Gera um documento PDF a partir de um template guardado na base de dados.
 * Substitui placeholders, renderiza HTML, tabelas, imagens, e anexos de danos.
 * Devolve o objecto jsPDF gerado.
 */
export async function generateDocumentFromTemplate(params: GenerateDocumentParams): Promise<jsPDF> {
  const {
    templateId,
    motoristaData,
    documentData: inputDocumentData = {},
    action = 'print',
    skipOutput = false,
    skipFooter = false,
    headerLogoUrl,
    footerText,
  } = params;

  try {
    // Buscar template da base de dados
    const { data: templateDataRaw, error: templateError } = await supabase
      .from('document_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !templateDataRaw) {
      console.error('Erro ao carregar template:', templateError);
      throw new Error('Template não encontrado');
    }

    const templateData = templateDataRaw as unknown as DocumentTemplate;
    const documentData = { ...inputDocumentData };

    // Substituir placeholders no conteúdo HTML do template
    const conteudo = replaceDynamicFields(
      templateData.template_data.conteudo,
      motoristaData,
      documentData
    );

    // Verificar existência de {{secao_danos}} — se presente, o anexo é renderizado INLINE
    const hasDanosPlaceholder = conteudo.includes('{{secao_danos}}');
    const [htmlPart1, htmlPart2] = hasDanosPlaceholder
      ? conteudo.split(/\{\{secao_danos\}\}/)
      : [conteudo, ''];

    const existingPdf = params.existingPdf;
    const pdf = existingPdf || new jsPDF('p', 'mm', 'a4');
    const startPage = pdf.getNumberOfPages();

    const pageWidth = 210;
    const pageHeight = 297;
    const leftMargin = 20;
    const rightMargin = 20;

    // Papel timbrado (background): a empresa manda sempre; só cai para o
    // timbre gravado no próprio template se a empresa não tiver nenhum
    // definido (compatibilidade com templates configurados antes de o timbre
    // passar a viver na empresa).
    const papelTimbradoUrl: string | null =
      (documentData?.empresaData as { papelTimbrado?: string | null } | undefined)
        ?.papelTimbrado || templateData.papel_timbrado_url || null;

    const bg: HTMLImageElement | null =
      papelTimbradoUrl && !existingPdf
        ? await loadImage(papelTimbradoUrl).catch(() => null)
        : null;

    const hasLetterhead = !!bg;

    // Margens ajustadas para papel timbrado
    const topMargin = templateData.template_data.topMargin ?? (hasLetterhead ? 42 : 32);
    const bottomMarginLetterhead =
      templateData.template_data.bottomMargin ?? (hasLetterhead ? 38 : 22);
    const bottomMargin = hasLetterhead ? bottomMarginLetterhead : 22;
    const maxWidth = pageWidth - leftMargin - rightMargin;
    let yPos = topMargin;

    // Com papel timbrado a área útil é menor; comprimir entrelinha.
    const lineFactor = hasLetterhead ? 1.24 : 1.5;

    // Se este PDF é uma continuação (existingPdf), desenhar bg da 1ª página
    if (existingPdf && bg) {
      pdf.addPage();
      pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
    } else if (!existingPdf && bg) {
      pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
    }

    // Contexto para renderHtmlBlock
    const htmlCtx: RenderHtmlBlockCtx = {
      leftMargin,
      rightMargin,
      topMargin,
      pageWidth,
      pageHeight,
      bottomMargin,
      maxWidth,
      lineFactor,
      hasLetterhead,
      bg,
      signatures: new Map(),
    };

    // Renderizar parte 1 (antes de {{secao_danos}})
    yPos = await renderHtmlBlock(pdf, htmlPart1, yPos, htmlCtx);

    // Renderizar anexoFotos (check-in/check-out) em grelha 2×3
    if (params.anexoFotos?.length) {
      const cols = 2;
      const rows = 3;
      const gap = 6;
      const cellW = (maxWidth - gap * (cols - 1)) / cols;
      const gridTop = topMargin + 10;
      const cellH = (pageHeight - bottomMargin - gridTop - gap * (rows - 1)) / rows;

      const imagens = new Map<string, HTMLImageElement>();
      for (const grupo of params.anexoFotos) {
        for (const url of grupo.urls) {
          if (!imagens.has(url)) {
            try {
              imagens.set(url, await loadImage(url));
            } catch {
              /* skip falhas de carregamento */
            }
          }
        }
      }

      for (const grupo of params.anexoFotos) {
        pdf.addPage();
        if (bg) pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(grupo.titulo, leftMargin, topMargin + 4);
        let idx = 0;
        for (let pi = 0; pi < grupo.urls.length && pi < cols * rows; pi++) {
          const url = grupo.urls[pi];
          const r = Math.floor(idx / cols);
          const c = idx % cols;
          const cx = leftMargin + c * (cellW + gap);
          const cy = gridTop + r * (cellH + gap);
          pdf.rect(cx, cy, cellW, cellH, 'S');
          const img = imagens.get(url);
          if (img) {
            const ratio = img.width && img.height ? img.width / img.height : 1.5;
            let w = cellW - 2;
            let h = w / ratio;
            if (h > cellH - 2) {
              h = cellH - 2;
              w = h * ratio;
            }
            pdf.addImage(img, 'JPEG', cx + (cellW - w) / 2, cy + (cellH - h) / 2, w, h);
          }
          idx++;
        }
      }
    }

    // Preparar anexo de danos (buscar da BD se necessário, mesclar com dados locais)
    let efectivoAnexoDanos = params.anexoDanos;
    if (templateData.tipo === 'anexo_danos' && params.viaturaId && !efectivoAnexoDanos) {
      const matricula = (documentData?.viatura_matricula as string | undefined) ?? '';
      efectivoAnexoDanos = await fetchAnexoDanos(params.viaturaId, matricula, params.contratoId);
      if (!efectivoAnexoDanos) {
        console.warn('Template anexo_danos: viatura sem danos activos ou erro ao buscar');
      }
    }

    // Mesclar fotos e danos locais (pré-visualização)
    if (efectivoAnexoDanos && params.fotosMomento?.length) {
      const fotosMomentoItems = params.fotosMomento.map((url) => ({
        url,
        origem: 'Nesta recolha/entrega',
      }));
      efectivoAnexoDanos = {
        ...efectivoAnexoDanos,
        fotos: [...fotosMomentoItems, ...efectivoAnexoDanos.fotos].slice(0, 6),
      };
    }
    if (efectivoAnexoDanos && params.danosMomento?.length) {
      efectivoAnexoDanos = {
        ...efectivoAnexoDanos,
        danos: [...params.danosMomento, ...efectivoAnexoDanos.danos],
      };
    }

    // Renderizar anexo de danos
    if (efectivoAnexoDanos) {
      const danosCtx: AnexoDanosCtx = {
        leftMargin,
        rightMargin,
        topMargin,
        pageWidth,
        pageHeight,
        bottomMargin,
        maxWidth,
      };
      yPos = await renderAnexoDanos(pdf, efectivoAnexoDanos, danosCtx, hasDanosPlaceholder, yPos);
    }

    // Renderizar parte 2 (após {{secao_danos}})
    if (hasDanosPlaceholder && htmlPart2.trim()) {
      yPos = await renderHtmlBlock(pdf, htmlPart2, yPos, htmlCtx);
    }

    // Numeração de páginas
    const endPage = pdf.getNumberOfPages();
    const docTotalPages = endPage - startPage + 1;
    const usarFooterEmpresa = !!params.footerText && !hasLetterhead;

    for (let i = startPage; i <= endPage && !params.skipFooter; i++) {
      pdf.setPage(i);
      pdf.setFontSize(usarFooterEmpresa ? 7.5 : 9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(138, 141, 153);
      const pageText = `Página ${i - startPage + 1} de ${docTotalPages}`;

      if (usarFooterEmpresa) {
        const footerY = pageHeight - 14;
        pdf.setDrawColor(220, 222, 228);
        pdf.setLineWidth(0.2);
        pdf.line(leftMargin, footerY - 4, pageWidth - rightMargin, footerY - 4);
        pdf.text(params.footerText!, leftMargin, footerY);
        const pw = pdf.getTextWidth(pageText);
        pdf.text(pageText, pageWidth - rightMargin - pw, footerY);
      } else {
        const textWidth = pdf.getTextWidth(pageText);
        const numY = hasLetterhead ? pageHeight - bottomMargin + 6 : pageHeight - 18;
        pdf.text(pageText, pageWidth - rightMargin - textWidth, numY);
      }
    }

    // Executar ação
    if (!params.skipOutput) {
      const fileName = `${templateData.nome}_${motoristaData.nome}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      if (action === 'print') {
        printPdf(pdf, fileName, hasLetterhead);
      } else {
        pdf.save(fileName);
      }
    }

    return pdf;
  } catch (error) {
    console.error('Erro ao gerar documento:', error);
    throw error;
  }
}

/**
 * Gera vários documentos (templates) num ÚNICO PDF, com uma folha branca a
 * separar cada documento. Cada documento mantém a sua própria numeração e
 * rodapé. Ordem do array = ordem no PDF.
 */
export const generateDocumentosCombinados = async (
  docs: DocumentoCombinado[],
  opts: { action?: 'print' | 'download'; fileName?: string } = {}
): Promise<jsPDF | null> => {
  const { action = 'print', fileName } = opts;
  if (docs.length === 0) return null;

  let pdf: jsPDF | undefined;
  for (let i = 0; i < docs.length; i++) {
    pdf = await generateDocumentFromTemplate({
      ...docs[i],
      existingPdf: pdf,
      skipOutput: true,
    });
    if (i < docs.length - 1) pdf.addPage();
  }
  if (!pdf) return null;

  const resolvedFileName = fileName || `documento_${format(new Date(), 'yyyyMMdd')}.pdf`;
  if (action === 'print') {
    printPdf(pdf, resolvedFileName);
  } else {
    pdf.save(resolvedFileName);
  }
  return pdf;
};
