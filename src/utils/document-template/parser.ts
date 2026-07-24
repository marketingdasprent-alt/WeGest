import { format } from 'date-fns';
import type { CellLine, DocEl, RGB, TableCellData } from './types';
import { substituirCartaoFrota } from './cartaoFrotaPlaceholders';

// ── Date helpers ────────────────────────────────────────────

const isValidYear = (date: Date): boolean => {
  const year = date.getFullYear();
  return year >= 1900 && year <= 2100;
};

const normalizeYear = (date: Date): Date => {
  const year = date.getFullYear();
  if (year >= 20000 && year < 30000) {
    const normalizedYear = year - 20000;
    return new Date(normalizedYear, date.getMonth(), date.getDate());
  }
  return date;
};

export const formatDate = (date: Date | string): string => {
  let d = typeof date === 'string' ? new Date(date) : date;
  d = normalizeYear(d);
  if (!isValidYear(d)) {
    console.error(`Data com ano inválido: ${d.getFullYear()}`);
    return 'DATA INVÁLIDA';
  }
  return format(d, 'dd/MM/yyyy');
};

export const formatDateExtended = (date: Date | string): string => {
  let d = typeof date === 'string' ? new Date(date) : date;
  d = normalizeYear(d);
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

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

// ── Placeholder replacement ─────────────────────────────────

/**
 * Substitute all supported {{placeholder}} patterns in template HTML content
 * with real values from motoristaData and documentData.
 */
export const replaceDynamicFields = (
  content: string,
  motoristaData: Record<string, any>,
  documentData: Record<string, any> = {}
): string => {
  let result = content;

  // Assinatura do colaborador
  {
    const assinatura = documentData['assinatura_colaborador'];
    const replacement =
      typeof assinatura === 'string' && assinatura.startsWith('data:image')
        ? `<img class="sig-colaborador" src="${assinatura.replace(/"/g, '&quot;')}">`
        : '';
    result = result.replace(/\{\{assinatura_colaborador\}\}/g, replacement);
  }

  // Assinatura do motorista
  {
    const assinatura = documentData['assinatura_motorista'];
    const replacement =
      typeof assinatura === 'string' && assinatura.startsWith('data:image')
        ? `<img class="sig-motorista" src="${assinatura.replace(/"/g, '&quot;')}">`
        : '';
    result = result.replace(/\{\{assinatura_motorista\}\}/g, replacement);
  }

  // Assinatura do responsável
  {
    const assinatura = documentData['assinatura_responsavel'];
    const replacement =
      typeof assinatura === 'string' && assinatura.startsWith('data:image')
        ? `<img class="sig-responsavel" src="${assinatura.replace(/"/g, '&quot;')}">`
        : '';
    result = result.replace(/\{\{assinatura_responsavel\}\}/g, replacement);
  }

  // Mapear campos do motorista
  const motoristaFieldMap: Record<string, string> = {
    motorista_nome: 'nome',
    motorista_email: 'email',
    motorista_telefone: 'telefone',
    motorista_morada: 'morada',
    motorista_nif: 'nif',
    motorista_documento_tipo: 'documento_tipo',
    motorista_documento_numero: 'documento_numero',
    motorista_documento_validade: 'documento_validade',
    motorista_iban: 'iban',
  };

  const motoristaFieldMapLegacy: Record<string, string> = {
    nome_motorista: 'nome',
    email_motorista: 'email',
    telefone_motorista: 'telefone',
    morada_motorista: 'morada',
    nif_motorista: 'nif',
    documento_tipo: 'documento_tipo',
    documento_numero: 'documento_numero',
  };

  Object.entries(motoristaFieldMap).forEach(([placeholder, key]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    const value = motoristaData[key];
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

  Object.entries(motoristaFieldMapLegacy).forEach(([placeholder, key]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    const value = motoristaData[key];
    result = result.replace(regex, value?.toString() || '');
  });

  // Campos da carta de condução e CMTVDE
  const cartaFieldMap: Record<string, string> = {
    carta_conducao: 'carta_conducao',
    carta_categorias: 'carta_categorias',
    carta_validade: 'carta_validade',
    cmtvde_numero: 'licenca_tvde_numero',
    cmtvde_validade: 'licenca_tvde_validade',
  };

  Object.entries(cartaFieldMap).forEach(([placeholder, key]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    let value = motoristaData[key];
    if (Array.isArray(value)) {
      value = value.join(', ');
    }
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

  // Campos da empresa
  const empresaFieldMap: Record<string, string> = {
    empresa_nome_completo: 'nomeCompleto',
    empresa_nif: 'nif',
    empresa_sede: 'sede',
    empresa_licenca_tvde: 'licencaTVDE',
    empresa_licenca_validade: 'licencaValidade',
    empresa_representante: 'representante',
    empresa_cargo_representante: 'cargoRepresentante',
  };

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

  Object.entries(empresaFieldMapLegacy).forEach(([placeholder, dbField]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    const value = documentData.empresaData?.[dbField] || '';
    result = result.replace(regex, value?.toString() || '');
  });

  // Campos do cliente (renting)
  const clienteFieldMap: Record<string, string> = {
    cliente_nome: 'nome',
    cliente_nif: 'nif',
    cliente_email: 'email',
    cliente_telefone: 'telefone',
    cliente_morada: 'morada',
    cliente_codigo_postal: 'codigo_postal',
    cliente_cidade: 'cidade',
    cliente_data_nascimento: 'data_nascimento',
    cliente_nome_comercial: 'nome_comercial',
    cliente_sede: 'sede',
    cliente_representante: 'representante',
    cliente_cargo_representante: 'cargo_representante',
  };

  Object.entries(clienteFieldMap).forEach(([placeholder, dbField]) => {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    const value = documentData.clienteData?.[dbField];
    if (placeholder.includes('data_') && value) {
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

  // Campos do contrato
  const contratoFields = [
    'data_inicio',
    'data_fim',
    'data_assinatura',
    'cidade_assinatura',
    'duracao_meses',
    'numero_contrato',
    'viatura_matricula',
    'viatura_data_matricula',
    'viatura_marca_modelo',
    'viatura_grupo',
    'viatura_kms',
    'viatura_combustivel_saida',
    'local_entrega',
    'local_recolha',
    'tarifa_diaria',
    'valor_semanal',
    'franquia',
    'caucao',
    'kms_incluidos',
    'km_adicional',
    'subtotal',
    'iva',
    'dias',
    'total',
    'observacoes',
    'colaborador_nome',
    'km_saida',
    'km_entrada',
    'combustivel_saida',
    'combustivel_entrada',
    'eletricidade_saida',
    'eletricidade_entrada',
    'momento_folha',
    'observacoes_momento',
    'responsavel_nome',
    'momento_responsavel',
  ];
  contratoFields.forEach((field) => {
    const regex = new RegExp(`\\{\\{${field}\\}\\}`, 'g');
    const value = documentData[field];
    if (field.includes('data') && value) {
      if (
        value instanceof Date ||
        (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))
      ) {
        const formattedDate =
          field === 'data_assinatura' ? formatDateExtended(value) : formatDate(value);
        result = result.replace(regex, formattedDate);
      } else {
        console.warn(`Campo ${field} tem valor não reconhecido como data:`, value);
        result = result.replace(regex, value?.toString() || '');
      }
    } else if (field === 'cidade_assinatura') {
      result = result.replace(regex, value?.toString() || motoristaData.cidade || 'Leiria');
    } else {
      result = result.replace(regex, value?.toString() || '');
    }
  });

  // Formato antigo {motorista.campo}
  Object.entries(motoristaData).forEach(([key, value]) => {
    const regex = new RegExp(`\\{motorista\\.${key}\\}`, 'g');
    result = result.replace(regex, value?.toString() || '');
  });

  // Formato antigo {documento.campo}
  Object.entries(documentData).forEach(([key, value]) => {
    const regex = new RegExp(`\\{documento\\.${key}\\}`, 'g');
    if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))) {
      result = result.replace(regex, formatDate(value));
    } else {
      result = result.replace(regex, value?.toString() || '');
    }
  });

  result = substituirCartaoFrota(result, motoristaData, documentData);

  // Datas especiais
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

export const checkUnresolvedPlaceholders = (content: string): string[] => {
  const matches = content.match(/\{\{[^}]+\}\}/g);
  if (!matches) return [];
  return [...new Set(matches)];
};

// ── Color parsing ───────────────────────────────────────────

export const parseColor = (css: string | null | undefined): RGB | undefined => {
  if (!css) return undefined;
  const s = css.trim().toLowerCase();
  if (s === 'transparent' || s === 'inherit' || s === 'initial') return undefined;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return undefined;
};

// ── HTML table parsing ──────────────────────────────────────

export const cellToLines = (el: HTMLElement, headerBold: boolean): CellLine[] => {
  const html = (el.innerHTML || '')
    .replace(/<\/(p|div|h[1-6])>/gi, '<br>')
    .replace(/<(p|div|h[1-6])[^>]*>/gi, '');
  const lines = html.split(/<br\s*\/?>/i).map((part) => {
    const colorMatch = part.match(/color\s*:\s*([^;"']+)/i);
    const sizeMatch = part.match(/font-size\s*:\s*(\d+)/i);
    return {
      text: part
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim(),
      bold: headerBold || /<(strong|b)[\s>]/i.test(part),
      color: colorMatch ? parseColor(colorMatch[1]) : undefined,
      fontSize: sizeMatch ? parseInt(sizeMatch[1]) : undefined,
    };
  });
  while (lines.length && !lines[lines.length - 1].text) lines.pop();
  return lines;
};

export const parseTable = (
  tableEl: HTMLElement
): { rows: TableCellData[][]; bordered: boolean } => {
  const rows: TableCellData[][] = [];
  const trs = Array.from(tableEl.querySelectorAll('tr'));
  trs.forEach((tr) => {
    const cells: TableCellData[] = [];
    Array.from(tr.children).forEach((c) => {
      const tag = c.tagName.toLowerCase();
      if (tag !== 'td' && tag !== 'th') return;
      const el = c as HTMLElement;
      const fw = el.style.fontWeight;
      const headerBold = tag === 'th' || fw === 'bold' || Number(fw) >= 600;
      const sigImg = el.querySelector('img[class^="sig-"]') as HTMLImageElement | null;
      cells.push({
        lines: cellToLines(el, headerBold),
        align: el.style.textAlign || 'left',
        bg: parseColor(el.style.backgroundColor),
        color: parseColor(el.style.color),
        fontSize: el.style.fontSize ? parseInt(el.style.fontSize) : undefined,
        colspan: Number(el.getAttribute('colspan') || '1') || 1,
        signatureSrc: sigImg?.getAttribute('src') || undefined,
      });
    });
    if (cells.length) rows.push(cells);
  });
  const bordered =
    tableEl.getAttribute('border') === '1' ||
    !!tableEl.style.border ||
    tableEl.classList.contains('bordered');
  return { rows, bordered };
};

// ── HTML → DocEl[] parser ───────────────────────────────────

export const htmlToText = (html: string): DocEl[] => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const elements: DocEl[] = [];

  const processNode = (node: Node, inheritedStyle: any = {}, parentIsBlock: boolean = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text && text.length > 0) {
        if (text.trim().length > 0 || !parentIsBlock) {
          const last = elements[elements.length - 1];
          // Só junta ao elemento anterior se tiverem o MESMO estilo (bold E
          // alinhamento) — dois runs com bold igual mas alinhamentos
          // diferentes pertencem a blocos distintos e nunca se devem colar
          // (ver bug do parágrafo em branco logo abaixo). Nunca junta a um
          // marcador de quebra de parágrafo ('\n') — é um sentinela, não um
          // run de texto real, e coincide facilmente em bold/align (ambos
          // undefined) com o texto simples do parágrafo seguinte.
          if (
            last &&
            last.type === 'text' &&
            last.text !== '\n' &&
            last.style?.bold === inheritedStyle.bold &&
            last.style?.align === inheritedStyle.align
          ) {
            last.text += text;
          } else if (text.trim().length > 0) {
            elements.push({
              type: 'text',
              text: text,
              style: { ...inheritedStyle },
            });
          } else if (/\s/.test(text)) {
            // Nó só com espaço/nbsp entre dois runs de estilo diferente (ex.:
            // "PARA " normal + "INSCRIÇÃO" bold) — preserva-o como espaço
            // simples, senão as duas palavras coladas ficam ilegíveis.
            elements.push({
              type: 'text',
              text: ' ',
              style: { ...inheritedStyle },
            });
          }
        }
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      // Quebra de página manual (botão "Nova página" no editor). Tem de ser
      // testada ANTES do switch: o nó é uma <div> com filhos decorativos (a
      // faixa cinzenta e o rótulo do editor) que nunca podem ir para o PDF.
      if (el.hasAttribute?.('data-page-break')) {
        elements.push({ type: 'pagebreak', style: {} });
        return;
      }

      const style: any = { ...inheritedStyle };

      // Font style
      if (tag === 'strong' || tag === 'b') style.bold = true;
      if (tag === 'i' || tag === 'em') style.italic = true;

      // Font size from class/style
      if (el.style.fontSize) {
        style.fontSize = parseInt(el.style.fontSize);
      }
      // Check class-based font sizes (common in TipTap)
      const classMatch = el.className?.match(/text-(\d+)/);
      if (classMatch) style.fontSize = parseInt(classMatch[1]);

      // Color
      if (el.style.color) style.color = parseColor(el.style.color);
      if (el.style.textAlign) style.align = el.style.textAlign;
      if (el.style.textAlign === 'center') style.align = 'center';
      if (el.style.textAlign === 'right') style.align = 'right';

      switch (tag) {
        case 'img': {
          const src = el.getAttribute('src') || '';
          if (src) {
            elements.push({
              type: 'image',
              src,
              style: { ...style },
            });
          }
          break;
        }
        case 'table':
        case 'tbody':
        case 'thead':
        case 'tfoot': {
          if (tag === 'table') {
            const parsed = parseTable(el);
            elements.push({
              type: 'table',
              rows: parsed.rows,
              bordered: parsed.bordered,
              style: { ...style },
            });
          } else {
            // tbody/thead/tfoot: process children directly
            Array.from(el.childNodes).forEach((child) => processNode(child, style, true));
          }
          break;
        }
        case 'hr': {
          elements.push({
            type: 'hr',
            text: '',
            style: { ...style },
          });
          break;
        }
        case 'br': {
          elements.push({
            type: 'text',
            text: '\n',
            style: { ...style },
          });
          break;
        }
        case 'p':
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
        case 'li': {
          // Parágrafo/heading/item de lista vazio (ex.: "&nbsp;" usado só como
          // espaçador) — não gera texto, só a quebra de linha mais abaixo.
          const isBlankSpacer = (el.textContent ?? '').trim() === '';
          if (!isBlankSpacer) {
            Array.from(el.childNodes).forEach((child) => processNode(child, style, true));
          }
          // Marca sempre o fim do bloco — sem isto, um parágrafo em branco
          // (que não gera nenhum elemento) faz o próximo parágrafo colar-se
          // directamente ao elemento de texto anterior (ex.: título), porque
          // a condição de merge acima só olha para bold/align, não para se
          // pertencem ao mesmo parágrafo de origem.
          elements.push({ type: 'text', text: '\n', style: {} });
          break;
        }
        case 'div':
        case 'span':
        case 'section':
        case 'header':
        case 'footer':
        default: {
          Array.from(el.childNodes).forEach((child) => processNode(child, style, true));
          break;
        }
      }
    }
  };

  Array.from(tempDiv.childNodes).forEach((child) => processNode(child, {}));
  return elements;
};
