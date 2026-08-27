import { momentoFolhaHtml } from './momentoFolhaCor';
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
import {
  renderAnexoDanos,
  renderNumeroContrato,
  renderPartes,
  type AnexoDanosCtx,
} from './render-anexo-danos';

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
    km_saida,
    km_entrada,
    combustivel_saida,
    combustivel_entrada,
    eletricidade_saida,
    eletricidade_entrada,
    momentoFolha,
    observacoesMomento,
  } = params;

  try {
    // O template pode chegar já resolvido — é o caso da regeneração a partir de
    // uma fotografia congelada. Aí não se vai à base de dados de propósito: uma
    // edição posterior do template mudaria um documento que já foi enviado para
    // assinar, e a pessoa assinaria coisa diferente da que recebeu.
    let templateData: DocumentTemplate;

    if (params.templateOverride) {
      templateData = params.templateOverride;
    } else {
      const { data: templateDataRaw, error: templateError } = await supabase
        .from('document_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (templateError || !templateDataRaw) {
        console.error('Erro ao carregar template:', templateError);
        throw new Error('Template não encontrado');
      }

      templateData = templateDataRaw as unknown as DocumentTemplate;
    }
    const documentData: Record<string, any> = {
      ...inputDocumentData,
      ...(km_saida != null ? { km_saida } : {}),
      ...(km_entrada != null ? { km_entrada } : {}),
      ...(combustivel_saida != null ? { combustivel_saida } : {}),
      ...(combustivel_entrada != null ? { combustivel_entrada } : {}),
      ...(eletricidade_saida != null ? { eletricidade_saida } : {}),
      ...(eletricidade_entrada != null ? { eletricidade_entrada } : {}),
      ...(momentoFolha != null ? { momento_folha: momentoFolhaHtml(momentoFolha) } : {}),
      ...(observacoesMomento != null ? { observacoes_momento: observacoesMomento } : {}),
    };

    // O anexo de danos é resolvido ANTES de se desenhar seja o que for: traz o
    // número do contrato (que vai para o canto superior direito e para o
    // placeholder) e as partes (que pertencem ao cabeçalho, não ao anexo).
    let efectivoAnexoDanos = params.anexoDanos;
    if (templateData.tipo === 'anexo_danos' && params.viaturaId && !efectivoAnexoDanos) {
      const matriculaAnexo = (inputDocumentData?.viatura_matricula as string | undefined) ?? '';
      efectivoAnexoDanos = await fetchAnexoDanos(
        params.viaturaId,
        matriculaAnexo,
        params.contratoId,
        params.folhaDanosMomentoActual ?? true
      );
      if (!efectivoAnexoDanos) {
        console.warn('Template anexo_danos: viatura sem danos activos ou erro ao buscar');
      }
    }
    if (efectivoAnexoDanos?.numeroContrato != null) {
      documentData.numero_contrato = String(efectivoAnexoDanos.numeroContrato);
    }

    // Substituir placeholders no conteúdo HTML do template
    const conteudo = replaceDynamicFields(
      templateData.template_data.conteudo,
      motoristaData,
      documentData
    );

    // Verificar existência de {{secao_danos}} — se presente, o anexo é renderizado INLINE
    const hasDanosPlaceholder = conteudo.includes('{{secao_danos}}');
    const [preDanos, htmlPart2] = hasDanosPlaceholder
      ? conteudo.split(/\{\{secao_danos\}\}/)
      : [conteudo, ''];

    // {{secao_partes}} — identificação de quem alugou. Fica onde o template o
    // puser (a seguir à empresa emissora, por desenho), e não dentro do anexo
    // de danos: pela leitura da folha, identificar as partes é cabeçalho.
    const hasPartesPlaceholder = preDanos.includes('{{secao_partes}}');
    const [htmlPart1, htmlPartEntre] = hasPartesPlaceholder
      ? preDanos.split(/\{\{secao_partes\}\}/)
      : [preDanos, ''];

    const existingPdf = params.existingPdf;
    const pdf = existingPdf || new jsPDF('p', 'mm', 'a4');
    const startPage = pdf.getNumberOfPages();

    const pageWidth = 210;
    const pageHeight = 297;
    const leftMargin = 20;
    const rightMargin = 20;

    // Papel timbrado (background): a empresa manda sempre; só cai para o timbre
    // gravado no próprio template se a empresa não tiver nenhum definido
    // (compatibilidade com templates configurados antes de o timbre passar a
    // viver na empresa).
    //
    // NÃO condicionar a `!existingPdf`: em documentos COMBINADOS (ex.: TVDE =
    // Prestação + Aluguer, via generateDocumentosCombinados) todos os docs a
    // seguir ao primeiro recebem `existingPdf` — com essa guarda o `bg` ficava
    // null e ESSES documentos saíam sem timbrado em nenhuma página (só o 1.º
    // vinha timbrado). Carregar sempre que houver URL faz o bloco abaixo
    // carimbar a 1.ª página do doc de continuação e o renderHtmlBlock/render
    // Table re-aplicá-lo nas páginas seguintes.
    const papelTimbradoUrl: string | null =
      (documentData?.empresaData as { papelTimbrado?: string | null } | undefined)?.papelTimbrado ||
      templateData.papel_timbrado_url ||
      null;

    const bg: HTMLImageElement | null = papelTimbradoUrl
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

    // Carimba o papel timbrado na 1ª página deste documento. Num documento de
    // continuação (existingPdf) NÃO se adiciona página aqui — o
    // generateDocumentosCombinados já criou a página separadora (pdf.addPage())
    // antes de nos chamar; carimbamos o timbrado SOBRE essa página. Adicionar
    // outra página aqui gerava uma folha em branco a mais por documento.
    if (bg) {
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

    const danosCtx: AnexoDanosCtx = {
      leftMargin,
      rightMargin,
      topMargin,
      pageWidth,
      pageHeight,
      bottomMargin,
      maxWidth,
    };

    // Número do contrato no canto superior direito, como no contrato de aluguer.
    if (efectivoAnexoDanos?.numeroContrato != null) {
      renderNumeroContrato(pdf, efectivoAnexoDanos.numeroContrato, danosCtx);
    }

    // Renderizar parte 1 (até {{secao_partes}}, ou até {{secao_danos}})
    yPos = await renderHtmlBlock(pdf, htmlPart1, yPos, htmlCtx);

    // Identificação das partes + o que vier entre elas e o anexo de danos.
    if (hasPartesPlaceholder) {
      yPos = renderPartes(pdf, efectivoAnexoDanos?.partes ?? [], danosCtx, yPos + 2);
      if (htmlPartEntre.trim()) {
        yPos = await renderHtmlBlock(pdf, htmlPartEntre, yPos, htmlCtx);
      }
    }

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
  opts: { action?: 'print' | 'download' | 'email'; fileName?: string } = {}
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
  } else if (action === 'download') {
    pdf.save(resolvedFileName);
  }
  // 'email': sem efeito secundário — quem chamou extrai o PDF para anexar ao envio.
  return pdf;
};
