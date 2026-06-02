import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { printPdf } from '@/lib/printPdf';

interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: string;
  empresa_id: string;
  papel_timbrado_url: string | null;
  template_data: {
    conteudo: string;
  };
  campos_dinamicos: {
    motorista: Array<{ id: string; label: string; tipo: string }>;
    empresa: Array<{ id: string; label: string; tipo: string }>;
    documento: Array<{ id: string; label: string; tipo: string }>;
  };
}

interface GenerateDocumentParams {
  templateId: string;
  motoristaData: Record<string, any>;
  documentData?: Record<string, any>;
  action?: 'print' | 'download';
  skipOutput?: boolean; // Se true, retorna o PDF sem abrir/gravar
  existingPdf?: jsPDF; // Se fornecido, adiciona páginas a este PDF em vez de criar novo
}

interface UploadDocumentParams extends GenerateDocumentParams {
  contratoId: string;
}

// Validar se uma data tem ano razoável (1900-2100)
const isValidYear = (date: Date): boolean => {
  const year = date.getFullYear();
  return year >= 1900 && year <= 2100;
};

// Normalizar ano com 5 dígitos (22025 -> 2025)
const normalizeYear = (date: Date): Date => {
  const year = date.getFullYear();
  if (year >= 20000 && year < 30000) {
    // Ano com 5 dígitos (ex: 22025 -> 2025)
    const normalizedYear = year - 20000;
    return new Date(normalizedYear, date.getMonth(), date.getDate());
  }
  return date;
};

const formatDate = (date: Date | string): string => {
  let d = typeof date === 'string' ? new Date(date) : date;

  // Normalizar ano se necessário
  d = normalizeYear(d);

  // Validar ano
  if (!isValidYear(d)) {
    console.error(`Data com ano inválido: ${d.getFullYear()}`);
    return 'DATA INVÁLIDA';
  }

  return format(d, 'dd/MM/yyyy');
};

const formatDateExtended = (date: Date | string): string => {
  let d = typeof date === 'string' ? new Date(date) : date;

  // Normalizar ano se necessário
  d = normalizeYear(d);

  // Validar ano
  if (!isValidYear(d)) {
    console.error(`Data com ano inválido: ${d.getFullYear()}`);
    return 'DATA INVÁLIDA';
  }

  const meses = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];

  const dia = d.getDate();
  const mes = meses[d.getMonth()];
  const ano = d.getFullYear();

  return `${dia} de ${mes} de ${ano}`;
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

const replaceDynamicFields = (
  content: string,
  motoristaData: Record<string, any>,
  documentData: Record<string, any> = {}
): string => {
  let result = content;

  // Mapear campos do motorista para o formato usado nos templates: {{motorista_CAMPO}}
  const motoristaFieldMap: Record<string, string> = {
    motorista_nome: 'nome',
    motorista_email: 'email',
    motorista_telefone: 'telefone',
    motorista_morada: 'morada',
    motorista_nif: 'nif',
    motorista_documento_tipo: 'documento_tipo',
    motorista_documento_numero: 'documento_numero',
    motorista_documento_validade: 'documento_validade',
  };

  // COMPATIBILIDADE: Suportar formato antigo invertido {{nome_motorista}}
  const motoristaFieldMapLegacy: Record<string, string> = {
    nome_motorista: 'nome',
    email_motorista: 'email',
    telefone_motorista: 'telefone',
    morada_motorista: 'morada',
    nif_motorista: 'nif',
    documento_tipo: 'documento_tipo',
    documento_numero: 'documento_numero',
  };

  // Substituir campos do motorista no formato {{motorista_nome}}
  Object.entries(motoristaFieldMap).forEach(([placeholder, key]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    const value = motoristaData[key];

    // Se for data, formatar
    if (placeholder.includes('validade') && value) {
      if (
        value instanceof Date ||
        (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))
      ) {
        result = result.replace(regex, formatDate(value));
        return;
      }
    }
    result = result.replace(regex, value?.toString() || '');
  });

  // COMPATIBILIDADE: Substituir formato antigo {{nome_motorista}}
  Object.entries(motoristaFieldMapLegacy).forEach(([placeholder, key]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    const value = motoristaData[key];
    result = result.replace(regex, value?.toString() || '');
  });

  // Mapear campos da carta de condução e CMTVDE (formato direto, sem prefixo)
  const cartaFieldMap: Record<string, string> = {
    carta_conducao: 'carta_conducao',
    carta_categorias: 'carta_categorias',
    carta_validade: 'carta_validade',
    cmtvde_numero: 'licenca_tvde_numero',
    cmtvde_validade: 'licenca_tvde_validade',
  };

  // Substituir campos da carta e CMTVDE
  Object.entries(cartaFieldMap).forEach(([placeholder, key]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    let value = motoristaData[key];

    // Se for array (carta_categorias), juntar com vírgulas
    if (Array.isArray(value)) {
      value = value.join(', ');
    }

    // Se for data, formatar
    if (placeholder.includes('validade') && value) {
      if (
        value instanceof Date ||
        (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))
      ) {
        result = result.replace(regex, formatDate(value));
        return;
      }
    }

    result = result.replace(regex, value?.toString() || '');
  });

  // Substituir campos da empresa no formato {{empresa_CAMPO}}
  const empresaFieldMap: Record<string, string> = {
    empresa_nome_completo: 'nomeCompleto',
    empresa_nif: 'nif',
    empresa_sede: 'sede',
    empresa_licenca_tvde: 'licencaTVDE',
    empresa_licenca_validade: 'licencaValidade',
    empresa_representante: 'representante',
    empresa_cargo_representante: 'cargoRepresentante',
  };

  // COMPATIBILIDADE: Suportar formato antigo {{nome_empresa}}
  const empresaFieldMapLegacy: Record<string, string> = {
    nome_empresa: 'nomeCompleto',
    nif_empresa: 'nif',
    sede_empresa: 'sede',
    licenca_tvde: 'licencaTVDE',
    representante: 'representante',
  };

  Object.entries(empresaFieldMap).forEach(([placeholder, dbField]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    const value = documentData.empresaData?.[dbField] || '';
    result = result.replace(regex, value?.toString() || '');
  });

  // COMPATIBILIDADE: Substituir formato antigo
  Object.entries(empresaFieldMapLegacy).forEach(([placeholder, dbField]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    const value = documentData.empresaData?.[dbField] || '';
    result = result.replace(regex, value?.toString() || '');
  });

  // Substituir campos do contrato no formato {{data_inicio}}
  const contratoFields = ['data_inicio', 'data_assinatura', 'cidade_assinatura', 'duracao_meses'];
  contratoFields.forEach((field) => {
    const regex = new RegExp(`\\{\\{${field}\\}\\}`, 'g');
    const value = documentData[field];

    // Se for data, formatar
    if (field.includes('data') && value) {
      // Processar campos de data
      if (
        value instanceof Date ||
        (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))
      ) {
        const formattedDate =
          field === 'data_assinatura' ? formatDateExtended(value) : formatDate(value);
        result = result.replace(regex, formattedDate);
      } else {
        // Fallback: usar valor como string se não for data válida
        console.warn(`Campo ${field} tem valor não reconhecido como data:`, value);
        result = result.replace(regex, value?.toString() || '');
      }
    } else if (field === 'cidade_assinatura') {
      // Cidade de assinatura - usar valor passado ou fallback para o motorista.cidade
      result = result.replace(regex, value?.toString() || motoristaData.cidade || 'Leiria');
    } else {
      result = result.replace(regex, value?.toString() || '');
    }
  });

  // MANTER: Código antigo para compatibilidade com formato {motorista.campo}
  Object.entries(motoristaData).forEach(([key, value]) => {
    const regex = new RegExp(`\\{motorista\\.${key}\\}`, 'g');
    result = result.replace(regex, value?.toString() || '');
  });

  // Substituir campos do documento (formato antigo)
  Object.entries(documentData).forEach(([key, value]) => {
    const regex = new RegExp(`\\{documento\\.${key}\\}`, 'g');

    // Se for uma data, formatar
    if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))) {
      result = result.replace(regex, formatDate(value));
    } else {
      result = result.replace(regex, value?.toString() || '');
    }
  });

  // Formatar datas especiais (ambos formatos)
  const today = new Date();
  result = result.replace(/\{\{data_atual\}\}/g, formatDate(today));
  result = result.replace(/\{\{data_atual_extenso\}\}/g, formatDateExtended(today));
  result = result.replace(/\{data_atual\}/g, formatDate(today));
  result = result.replace(/\{data_atual_extenso\}/g, formatDateExtended(today));

  // Detectar placeholders não substituídos
  const unresolvedPlaceholders = result.match(/\{\{[^}]+\}\}/g);
  if (unresolvedPlaceholders && unresolvedPlaceholders.length > 0) {
    const uniquePlaceholders = [...new Set(unresolvedPlaceholders)];
    console.warn('ATENÇÃO: Placeholders não substituídos:', uniquePlaceholders);
  }

  return result;
};

// Função exportada para verificar placeholders não resolvidos
export const checkUnresolvedPlaceholders = (content: string): string[] => {
  const matches = content.match(/\{\{[^}]+\}\}/g);
  if (!matches) return [];
  return [...new Set(matches)];
};

// Converter HTML para texto simples, preservando formatação para o PDF
const htmlToText = (
  html: string
): Array<{
  type: 'text' | 'image';
  text?: string;
  src?: string;
  style: { bold?: boolean; italic?: boolean; fontSize?: number; align?: string };
}> => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const elements: Array<{
    type: 'text' | 'image';
    text?: string;
    src?: string;
    style: { bold?: boolean; italic?: boolean; fontSize?: number; align?: string };
  }> = [];

  const processNode = (node: Node, inheritedStyle: any = {}, parentIsBlock: boolean = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;

      // Preservar o texto original sem fazer trim
      // O trim anterior estava removendo espaços necessários ao redor de elementos inline
      if (text && text.length > 0) {
        // Apenas ignorar nós que são SOMENTE whitespace E estão entre blocos
        // (não dentro de blocos com conteúdo)
        const isOnlyWhitespace = /^\s+$/.test(text);

        if (!isOnlyWhitespace) {
          // Preservar texto completo, incluindo espaços ao redor
          elements.push({ type: 'text', text, style: { ...inheritedStyle } });
        } else if (!parentIsBlock) {
          // Se for apenas whitespace mas está em contexto inline, preservar
          elements.push({ type: 'text', text, style: { ...inheritedStyle } });
        }
        // Se for apenas whitespace E parentIsBlock, ignorar (espaços entre tags de bloco)
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const style = { ...inheritedStyle };

      const tagName = element.tagName.toLowerCase();

      // Detectar formatação inline (não quebra linha)
      if (tagName === 'strong' || tagName === 'b') style.bold = true;
      if (tagName === 'em' || tagName === 'i') style.italic = true;
      if (tagName === 'h1') {
        style.bold = true;
        style.fontSize = 16;
      }
      if (tagName === 'h2') {
        style.bold = true;
        style.fontSize = 14;
      }

      // Detectar alinhamento
      const textAlign = element.style.textAlign;
      if (textAlign) style.align = textAlign;

      // Detectar tamanho de fonte inline
      const fontSize = element.style.fontSize;
      if (fontSize) {
        style.fontSize = parseInt(fontSize);
      }

      // Tags que são blocos e devem criar nova linha APENAS se estiverem em blocos separados
      const blockElements = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

      if (blockElements.includes(tagName)) {
        const childNodes = Array.from(element.childNodes);

        childNodes.forEach((child) => {
          processNode(child, style, true); // Indicar que o pai é um bloco
        });

        // Sempre adicionar quebra de linha após parágrafo (mesmo se vazio)
        // Isso permite que parágrafos vazios criem espaçamento extra (pular linha)
        elements.push({ type: 'text', text: '\n', style: {} });
      } else if (tagName === 'img') {
        const src = element.getAttribute('src');
        if (src) {
          elements.push({
            type: 'image',
            src,
            style: { align: element.style.textAlign || 'left' },
          });
          // Adicionar quebra de linha após imagem
          elements.push({ type: 'text', text: '\n', style: {} });
        }
      } else if (tagName === 'br') {
        elements.push({ type: 'text', text: '\n', style: {} });
      } else {
        // Tags inline (strong, em, span, u, etc) - não quebram linha
        const childNodes = Array.from(element.childNodes);
        childNodes.forEach((child) => {
          processNode(child, style, false); // Indicar que o pai é inline
        });
      }
    }
  };

  const rootChildren = Array.from(tempDiv.childNodes);
  rootChildren.forEach((child) => {
    processNode(child, {}, true); // Raiz é tratada como bloco
  });

  return elements;
};

export const generateDocumentFromTemplate = async (
  params: GenerateDocumentParams
): Promise<jsPDF | null> => {
  const { templateId, motoristaData, documentData = {}, action = 'print' } = params;

  try {
    // Buscar o template da base de dados
    const { data: template, error } = await supabase
      .from('document_templates')
      .select('*')
      .eq('id', templateId)
      .eq('ativo', true)
      .single();

    if (error || !template) {
      throw new Error('Template não encontrado ou inativo');
    }

    const templateData = template as unknown as DocumentTemplate;

    // Substituir campos dinâmicos no conteúdo
    const processedContent = replaceDynamicFields(
      templateData.template_data.conteudo,
      motoristaData,
      documentData
    );

    // Criar PDF ou usar existente
    const pdf =
      params.existingPdf ||
      new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

    // Se estamos a adicionar a um PDF existente, adicionar nova página
    const startPage = params.existingPdf ? pdf.getNumberOfPages() + 1 : 1;
    if (params.existingPdf) {
      pdf.addPage();
    }

    // Carregar papel timbrado se existir
    let bg: HTMLImageElement | null = null;
    if (templateData.papel_timbrado_url) {
      try {
        bg = await loadImage(templateData.papel_timbrado_url);
        pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
      } catch (error) {
        console.warn('Erro ao carregar papel timbrado:', error);
      }
    }

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const leftMargin = 30;
    const rightMargin = 20;
    const topMargin = 50; // Margem superior igual à inferior
    const bottomMargin = 50; // Margem aumentada: protege faixa amarela inferior do papel timbrado
    const maxWidth = pageWidth - leftMargin - rightMargin;
    let yPos = topMargin;

    // Processar HTML e renderizar no PDF diretamente
    const contentElements = htmlToText(processedContent);

    // Agrupar elementos consecutivos com mesmo alinhamento em "linhas lógicas"
    const groupedElements: Array<{
      align: string;
      segments: Array<{ text: string; style: any; isImage?: boolean }>;
    }> = [];

    let currentGroup: {
      align: string;
      segments: Array<{ text: string; style: any; isImage?: boolean }>;
    } | null = null;

    for (const element of contentElements) {
      if (element.type === 'image') {
        // Imagens sempre criam novo grupo
        if (currentGroup && currentGroup.segments.length > 0) {
          groupedElements.push(currentGroup);
          currentGroup = null;
        }
        groupedElements.push({
          align: element.style?.align || 'left',
          segments: [{ text: '', style: element, isImage: true }],
        });
        continue;
      }

      const { text, style } = element;
      // Preservar alinhamento do contexto anterior para quebras de linha
      const align = text === '\n' ? currentGroup?.align || 'left' : style.align || 'left';

      // Se for quebra de linha explícita, fechar grupo atual
      if (text === '\n') {
        if (currentGroup && currentGroup.segments.length > 0) {
          groupedElements.push(currentGroup);
        }
        groupedElements.push({ align: 'left', segments: [{ text: '\n', style: {} }] });
        currentGroup = null;
        continue;
      }

      // Se não há grupo atual OU o alinhamento mudou, criar novo grupo
      if (!currentGroup || currentGroup.align !== align) {
        if (currentGroup && currentGroup.segments.length > 0) {
          groupedElements.push(currentGroup);
        }
        currentGroup = { align, segments: [] };
      }

      // Adicionar texto ao grupo atual
      currentGroup.segments.push({ text, style });
    }

    // Adicionar último grupo se existir
    if (currentGroup && currentGroup.segments.length > 0) {
      groupedElements.push(currentGroup);
    }

    // Renderizar conteúdo agrupado
    for (const group of groupedElements) {
      // Se for quebra de linha
      if (group.segments.length === 1 && group.segments[0].text === '\n') {
        // Adicionar espaçamento equivalente a uma linha (usa fontSize padrão 10)
        yPos += 10 * 0.352777778 * 1.5; // ~5.29mm = mesma altura de uma linha de texto
        continue;
      }

      // Se for imagem
      if (group.segments[0].isImage) {
        const imgElement = group.segments[0].style;
        try {
          const img = await loadImage(imgElement.src);

          // Calcular dimensões mantendo aspect ratio
          const maxImgWidth = maxWidth;
          const maxImgHeight = 80;
          const imgAspect = img.width / img.height;

          let imgWidth = maxImgWidth;
          let imgHeight = imgWidth / imgAspect;

          if (imgHeight > maxImgHeight) {
            imgHeight = maxImgHeight;
            imgWidth = imgHeight * imgAspect;
          }

          // Verificar se cabe na página
          if (yPos + imgHeight > pageHeight - bottomMargin) {
            pdf.addPage();
            if (bg) pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
            yPos = topMargin;
          }

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

      // Renderizar grupo de texto com quebra automática
      const align = group.align;
      const maxFontSize = Math.max(...group.segments.map((seg) => seg.style.fontSize || 10));

      // Função auxiliar para renderizar uma linha
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
          pdf.text(seg.text, xPos, y);

          xPos += seg.width;
        }
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

        // Quebrar o texto preservando espaços originais
        const words = text.match(/\S+\s*/g) || (text.trim() ? [text] : []);

        for (let j = 0; j < words.length; j++) {
          const word = words[j];

          // Se é a última palavra deste segmento E não tem espaço trailing
          // E o próximo segmento começa com espaço, adicionar o espaço aqui
          const isLastWordInSegment = j === words.length - 1;
          let wordToRender = word;

          if (isLastWordInSegment && nextSegment) {
            const currentEndsWithSpace = /\s$/.test(word);
            const nextStartsWithSpace = /^\s/.test(nextSegment.text);

            // Se atual não termina com espaço MAS próximo começa com espaço,
            // adicionar espaço ao final desta palavra
            if (!currentEndsWithSpace && nextStartsWithSpace) {
              wordToRender = word + ' ';
            }
          }

          const wordWidth = pdf.getTextWidth(wordToRender);

          // Se a palavra cabe na linha atual
          if (currentLineWidth + wordWidth <= maxWidth) {
            currentLineSegments.push({ text: wordToRender, style, width: wordWidth });
            currentLineWidth += wordWidth;
          } else {
            // Renderizar linha atual
            if (currentLineSegments.length > 0) {
              const lineHeight = maxFontSize * 0.352777778 * 1.5;
              if (yPos + lineHeight > pageHeight - bottomMargin) {
                pdf.addPage();
                if (bg) pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
                yPos = topMargin;
              }

              renderLine(currentLineSegments, align, yPos);
              yPos += lineHeight;
            }

            // Iniciar nova linha com a palavra atual
            currentLineSegments = [{ text: wordToRender, style, width: wordWidth }];
            currentLineWidth = wordWidth;
          }
        }
      }

      // Renderizar última linha do grupo
      if (currentLineSegments.length > 0) {
        renderLine(currentLineSegments, align, yPos);
        // NÃO adicionar espaço aqui - o próximo elemento (texto ou \n) controlará o espaçamento
      }
    }

    // Adicionar numeração de páginas (apenas deste documento, não de PDFs anteriores)
    const endPage = pdf.getNumberOfPages();
    const docTotalPages = endPage - startPage + 1;
    for (let i = startPage; i <= endPage; i++) {
      pdf.setPage(i);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(128, 128, 128);
      const pageText = `Página ${i - startPage + 1} de ${docTotalPages}`;
      const textWidth = pdf.getTextWidth(pageText);
      // Posicionar a 35mm da borda inferior da página (margem aumentada em 20 pontos)
      pdf.text(pageText, (pageWidth - textWidth) / 2, pageHeight - 35);
    }

    // Executar ação (imprimir ou download)
    if (!params.skipOutput) {
      const fileName = `${templateData.nome}_${motoristaData.nome}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      if (action === 'print') {
        printPdf(pdf, fileName);
      } else {
        pdf.save(fileName);
      }
    }

    return pdf;
  } catch (error) {
    console.error('Erro ao gerar documento:', error);
    throw error;
  }
};

// Upload document to Supabase Storage and return the URL
export const uploadDocumentToStorage = async (
  params: UploadDocumentParams
): Promise<string | null> => {
  const { templateId, motoristaData, documentData = {}, contratoId, action = 'print' } = params;

  try {
    // First generate the PDF
    const pdf = await generateDocumentFromTemplate({
      templateId,
      motoristaData,
      documentData,
      action,
    });

    if (!pdf) return null;

    // Função para sanitizar nome do arquivo para o Storage
    const sanitizeFileName = (name: string): string => {
      return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-zA-Z0-9_-]/g, '_') // Substitui caracteres especiais por _
        .replace(/_+/g, '_') // Remove underscores duplicados
        .replace(/^_|_$/g, ''); // Remove underscores no início/fim
    };

    // Get the template name for the filename
    const { data: template } = await supabase
      .from('document_templates')
      .select('nome')
      .eq('id', templateId)
      .single();

    const templateName = template?.nome || 'documento';
    const sanitizedTemplate = sanitizeFileName(templateName);
    const sanitizedNome = sanitizeFileName(motoristaData.nome || 'motorista');
    const fileName = `${contratoId}/${sanitizedTemplate}_${sanitizedNome}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;

    // Convert PDF to blob
    const pdfBlob = pdf.output('blob');

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage.from('documentos').upload(fileName, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

    if (error) {
      console.error('Erro ao fazer upload do documento:', error);
      return null;
    }

    return data.path;
  } catch (error) {
    console.error('Erro ao fazer upload do documento:', error);
    return null;
  }
};

export const fetchAvailableTemplates = async (empresaId?: string) => {
  const query = supabase
    .from('document_templates')
    .select('id, nome, tipo, empresa_id')
    .eq('ativo', true)
    .order('nome', { ascending: true });

  if (empresaId) {
    query.eq('empresa_id', empresaId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
};
