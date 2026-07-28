import type jsPDF from 'jspdf';
import type { DocEl, RGB } from './types';
import { htmlToText, loadImage } from './parser';
import { renderTable } from './render-table';
import type { TableCtx } from './types';

export interface RenderHtmlBlockCtx {
  leftMargin: number;
  rightMargin: number;
  topMargin: number;
  pageWidth: number;
  pageHeight: number;
  bottomMargin: number;
  maxWidth: number;
  lineFactor: number;
  hasLetterhead: boolean;
  bg: HTMLImageElement | null;
  signatures: Map<string, HTMLImageElement>;
}

/**
 * Renderiza um bloco de HTML (texto, imagens, tabelas, hr) a partir de startY,
 * tratando agrupamento, assinaturas e quebra de página. Devolve o novo yPos.
 */
export async function renderHtmlBlock(
  pdf: jsPDF,
  html: string,
  startY: number,
  ctx: RenderHtmlBlockCtx
): Promise<number> {
  const {
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
    signatures,
  } = ctx;

  const contentElements = htmlToText(html);

  // Pré-carregar imagens de assinatura embebidas em células de tabela.
  // renderTable é síncrono, por isso resolvem-se aqui os data URLs para
  // HTMLImageElement antes de desenhar a tabela. Sem isto o Map fica sempre
  // vazio e a assinatura nunca aparece no PDF (a procura em renderTable falha
  // sempre). `signatures` é partilhado entre as duas partes do documento
  // (antes/depois de {{secao_danos}}) — o `has()` evita recarregar a mesma
  // imagem duas vezes.
  for (const element of contentElements) {
    if (element.type === 'table' && element.rows) {
      for (const row of element.rows) {
        for (const cell of row) {
          if (cell.signatureSrc && !signatures.has(cell.signatureSrc)) {
            try {
              signatures.set(cell.signatureSrc, await loadImage(cell.signatureSrc));
            } catch (err) {
              console.warn('Falha a carregar a imagem da assinatura:', err);
            }
          }
        }
      }
    }
  }

  // Agrupar elementos consecutivos com mesmo alinhamento em "linhas lógicas"
  const groupedElements: Array<{
    align: string;
    segments: Array<{
      text: string;
      style: any;
      isImage?: boolean;
      isTable?: boolean;
      isHr?: boolean;
      isPageBreak?: boolean;
    }>;
  }> = [];

  let currentGroup: {
    align: string;
    segments: Array<{
      text: string;
      style: any;
      isImage?: boolean;
      isTable?: boolean;
      isHr?: boolean;
      isPageBreak?: boolean;
    }>;
  } | null = null;

  for (const element of contentElements) {
    if (
      element.type === 'image' ||
      element.type === 'table' ||
      element.type === 'hr' ||
      element.type === 'pagebreak'
    ) {
      if (currentGroup && currentGroup.segments.length > 0) {
        groupedElements.push(currentGroup);
        currentGroup = null;
      }
      groupedElements.push({
        align: element.style?.align || 'left',
        segments: [
          {
            text: '',
            style: element,
            isImage: element.type === 'image',
            isTable: element.type === 'table',
            isHr: element.type === 'hr',
            isPageBreak: element.type === 'pagebreak',
          },
        ],
      });
      continue;
    }

    const { text, style } = element;
    const align = text === '\n' ? currentGroup?.align || 'left' : style.align || 'left';

    if (text === '\n') {
      if (currentGroup && currentGroup.segments.length > 0) {
        groupedElements.push(currentGroup);
      }
      groupedElements.push({ align: 'left', segments: [{ text: '\n', style: {} }] });
      currentGroup = null;
      continue;
    }

    if (!currentGroup || currentGroup.align !== align) {
      if (currentGroup && currentGroup.segments.length > 0) {
        groupedElements.push(currentGroup);
      }
      currentGroup = { align, segments: [] };
    }

    currentGroup.segments.push({ text, style });
  }

  if (currentGroup && currentGroup.segments.length > 0) {
    groupedElements.push(currentGroup);
  }

  let yPos = startY;

  const novaPagina = () => {
    pdf.addPage();
    if (bg) pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
    yPos = topMargin;
  };

  /**
   * Salta para a folha seguinte se `altura` já não couber nesta. Tem de ser
   * chamado ANTES de desenhar seja o que for — sem isto o yPos continuava a
   * crescer para lá do fim da folha e o conteúdo saía fora da página (ou por
   * baixo do papel timbrado).
   */
  const garantirEspaco = (altura: number) => {
    if (yPos + altura > pageHeight - bottomMargin) novaPagina();
  };

  // Quebra de página manual: fica PENDENTE até haver mesmo conteúdo para
  // desenhar. Assim uma quebra deixada no fim do template (ou seguida só de
  // parágrafos vazios) não produz uma folha em branco no PDF.
  let pendingPageBreak = false;
  const flushPageBreak = () => {
    if (!pendingPageBreak) return;
    novaPagina();
    pendingPageBreak = false;
  };

  // Renderizar conteúdo agrupado
  for (const group of groupedElements) {
    // Quebra de página manual
    if (group.segments[0].isPageBreak) {
      pendingPageBreak = true;
      continue;
    }

    // Quebra de linha
    if (group.segments.length === 1 && group.segments[0].text === '\n') {
      // Linhas em branco logo a seguir a uma quebra de página são absorvidas —
      // a página nova começa sempre na margem de topo.
      if (pendingPageBreak) continue;
      const alturaLinha = 10 * 0.352777778 * lineFactor;
      // Encher a folha de linhas em branco tem de empurrar para a folha
      // seguinte, como num processador de texto — era isto que faltava e fazia
      // parecer que o documento tinha um limite intransponível.
      garantirEspaco(alturaLinha);
      yPos += alturaLinha;
      continue;
    }

    // Imagem
    if (group.segments[0].isImage) {
      flushPageBreak();
      const imgElement = group.segments[0].style;
      try {
        const img = await loadImage(imgElement.src);
        const maxImgWidth = maxWidth;
        const maxImgHeight = 80;
        const imgAspect = img.width / img.height;

        let imgWidth = maxImgWidth;
        let imgHeight = imgWidth / imgAspect;

        if (imgHeight > maxImgHeight) {
          imgHeight = maxImgHeight;
          imgWidth = imgHeight * imgAspect;
        }

        garantirEspaco(imgHeight);

        let xPos = leftMargin;
        if (group.align === 'center') {
          xPos = (pageWidth - imgWidth) / 2;
        } else if (group.align === 'right') {
          xPos = pageWidth - rightMargin - imgWidth;
        }

        pdf.addImage(img, 'JPEG', xPos, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 5;
      } catch (error) {
        console.warn('Erro ao carregar imagem:', imgElement.src, error);
      }
      continue;
    }

    // Tabela
    if (group.segments[0].isTable) {
      flushPageBreak();
      const tableEl = group.segments[0].style as DocEl;
      if (tableEl.rows && tableEl.rows.length > 0) {
        yPos = renderTable(pdf, tableEl.rows, leftMargin, yPos, maxWidth, !!tableEl.bordered, {
          pageHeight,
          bottomMargin,
          topMargin,
          compact: hasLetterhead,
          bg,
          signatures,
        });
      }
      continue;
    }

    // Divisória (<hr>)
    if (group.segments[0].isHr) {
      flushPageBreak();
      yPos += 1;
      pdf.setDrawColor(224, 226, 232);
      pdf.setLineWidth(0.3);
      pdf.line(leftMargin, yPos, pageWidth - rightMargin, yPos);
      yPos += 3;
      continue;
    }

    // Renderizar grupo de texto com quebra automática.
    // Um grupo só de espaços não desenha nada — não pode materializar sozinho
    // uma quebra de página pendente (voltaria a criar a folha em branco).
    if (pendingPageBreak && !group.segments.some((seg) => seg.text.trim().length > 0)) {
      continue;
    }
    flushPageBreak();

    const align = group.align;
    const maxFontSize = Math.max(...group.segments.map((seg) => seg.style.fontSize || 10));
    const lineHeight = maxFontSize * 0.352777778 * lineFactor;

    // A PRIMEIRA linha do parágrafo também tem de caber. Antes só se verificava
    // ao mudar de linha dentro do parágrafo, por isso um parágrafo que
    // começasse já fora da folha era desenhado fora da página.
    garantirEspaco(lineHeight);

    const renderLine = (
      segments: Array<{ text: string; style: any; width: number }>,
      lineAlign: string,
      y: number
    ) => {
      const totalWidth = segments.reduce((sum, seg) => sum + seg.width, 0);

      let xPos = leftMargin;
      if (lineAlign === 'center') {
        xPos = (pageWidth - totalWidth) / 2;
      } else if (lineAlign === 'right') {
        xPos = pageWidth - rightMargin - totalWidth;
      }

      for (const seg of segments) {
        const fontSize = seg.style.fontSize || 10;
        const fontStyle = seg.style.bold ? 'bold' : seg.style.italic ? 'italic' : 'normal';

        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', fontStyle);
        const c = seg.style.color as RGB | undefined;
        pdf.setTextColor(c ? c[0] : 0, c ? c[1] : 0, c ? c[2] : 0);
        pdf.text(seg.text, xPos, y);

        xPos += seg.width;
      }
      pdf.setTextColor(0, 0, 0);
    };

    // Combinar todos os segmentos do grupo em linhas com quebra automática
    let currentLineSegments: Array<{ text: string; style: any; width: number }> = [];
    let currentLineWidth = 0;

    for (let i = 0; i < group.segments.length; i++) {
      const segment = group.segments[i];
      const nextSegment = group.segments[i + 1];
      const { text, style } = segment;
      const fontSize = style.fontSize || 10;
      const fontStyle = style.bold ? 'bold' : style.italic ? 'italic' : 'normal';

      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', fontStyle);

      const words = text.match(/\S+\s*/g) || (text.trim() ? [text] : []);

      for (let j = 0; j < words.length; j++) {
        const word = words[j];
        const isLastWordInSegment = j === words.length - 1;
        let wordToRender = word;

        if (isLastWordInSegment && nextSegment) {
          const currentEndsWithSpace = /\s$/.test(word);
          const nextStartsWithSpace = /^\s/.test(nextSegment.text);

          if (!currentEndsWithSpace && nextStartsWithSpace) {
            wordToRender = word + ' ';
          }
        }

        const wordWidth = pdf.getTextWidth(wordToRender);

        if (currentLineWidth + wordWidth <= maxWidth) {
          currentLineSegments.push({ text: wordToRender, style, width: wordWidth });
          currentLineWidth += wordWidth;
        } else {
          if (currentLineSegments.length > 0) {
            garantirEspaco(lineHeight);
            renderLine(currentLineSegments, align, yPos);
            yPos += lineHeight;
          }

          currentLineSegments = [{ text: wordToRender, style, width: wordWidth }];
          currentLineWidth = wordWidth;
        }
      }
    }

    // Renderizar última linha do grupo — também tem de caber (a última linha de
    // um parágrafo era desenhada sem verificação nenhuma).
    if (currentLineSegments.length > 0) {
      garantirEspaco(lineHeight);
      renderLine(currentLineSegments, align, yPos);
    }
  }

  return yPos;
}
