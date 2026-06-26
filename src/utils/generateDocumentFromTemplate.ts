import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { printPdf } from '@/lib/printPdf';
import { fetchAnexoDanos } from './fetchAnexoDanos';

interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: string;
  empresa_id: string;
  papel_timbrado_url: string | null;
  template_data: {
    conteudo: string;
    topMargin?: number;
    bottomMargin?: number;
  };
  campos_dinamicos: {
    motorista: Array<{ id: string; label: string; tipo: string }>;
    empresa: Array<{ id: string; label: string; tipo: string }>;
    documento: Array<{ id: string; label: string; tipo: string }>;
  };
}

/** Dano de viatura para o anexo do contrato. */
export interface AnexoDanoItem {
  localizacao: string;
  descricao: string;
  estado: string;
  data: string;
  valor?: string;
}

/** Anexo de danos da viatura: lista + fotos (máx 6) + QR code. */
export interface AnexoDanos {
  titulo: string;
  danos: AnexoDanoItem[];
  /** URLs já assinadas (máx 6) para a grelha de fotos. */
  fotos: string[];
  /** URL da página de danos da viatura (texto + QR). */
  linkUrl: string;
  /** data:image/png;base64 do QR code. */
  qrCodeDataUrl: string;
}

interface GenerateDocumentParams {
  templateId: string;
  motoristaData: Record<string, any>;
  documentData?: Record<string, any>;
  action?: 'print' | 'download';
  skipOutput?: boolean; // Se true, retorna o PDF sem abrir/gravar
  skipFooter?: boolean; // Se true, não desenha o rodapé/numeração (rodapé unificado externo)
  existingPdf?: jsPDF; // Se fornecido, adiciona páginas a este PDF em vez de criar novo
  /** URL de um logo a desenhar no canto superior esquerdo da 1ª página (tamanho fixo). */
  headerLogoUrl?: string;
  /** Texto do rodapé (ex.: "Empresa · NIF · Sede"). Quando dado e sem papel
   *  timbrado, desenha-se em baixo à esquerda e a numeração à direita. */
  footerText?: string;
  /** Fotos a anexar em folhas próprias após o conteúdo (grelha 2×3). Cada
   *  grupo gera um título de secção; os `urls` são imagens carregáveis. */
  anexoFotos?: Array<{ titulo: string; urls: string[] }>;
  /** Danos da viatura a anexar numa folha extra: lista + fotos (máx 6) + QR. */
  anexoDanos?: AnexoDanos;
  /** ID da viatura. Obrigatório para templates do tipo `anexo_danos`. */
  viaturaId?: string;
  /** Filtra danos da viatura por contrato (modo recolha). Sem este param mostra todos os danos activos. */
  contratoId?: string;
  /** KMs e combustível para preencher as variáveis {{km_saida}}, {{km_entrada}}, etc. */
  km_saida?: string;
  km_entrada?: string;
  combustivel_saida?: string;
  combustivel_entrada?: string;
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

  // Assinatura do colaborador — a sentinela {{assinatura_colaborador}} vive
  // dentro de uma célula de tabela ("O Colaborador"). O parser de tabelas
  // descarta HTML, por isso convertemo-la num <img> com classe marcadora que o
  // parseTable reconhece e a transforma numa imagem desenhada na célula. Sem
  // assinatura, resolve para vazio → a célula fica como hoje (traço + nome).
  {
    const assinatura = documentData['assinatura_colaborador'];
    const replacement =
      typeof assinatura === 'string' && assinatura.startsWith('data:image')
        ? `<img class="sig-colaborador" src="${assinatura.replace(/"/g, '&quot;')}">`
        : '';
    result = result.replace(/\{\{assinatura_colaborador\}\}/g, replacement);
  }

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

  // Substituir campos do cliente (renting) no formato {{cliente_CAMPO}}.
  // Vêm de documentData.clienteData (mesmo padrão de empresaData). No regime
  // rent-a-car o locatário é um cliente; os {{motorista_*}} continuam a funcionar
  // (o gerador mapeia o cliente também para motoristaData, por compatibilidade).
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

  // Substituir campos do contrato no formato {{data_inicio}}
  // Os campos numéricos/monetários (tarifa, franquia, total, etc.) são passados
  // já formatados como string por generateContratoPdf — aqui só se substituem.
  const contratoFields = [
    'data_inicio',
    'data_fim',
    'data_assinatura',
    'cidade_assinatura',
    'duracao_meses',
    'numero_contrato',
    'viatura_matricula',
    'viatura_marca_modelo',
    'viatura_grupo',
    'viatura_kms',
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
  ];
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

type RGB = [number, number, number];

interface CellLine {
  text: string;
  bold: boolean;
  color?: RGB;
  fontSize?: number;
}
interface TableCellData {
  lines: CellLine[];
  align?: string;
  bg?: RGB;
  color?: RGB;
  fontSize?: number;
  colspan: number;
  /** Data URL da assinatura a desenhar no topo da célula (marcador
   *  <img class="sig-colaborador">). Quando presente, renderTable desenha a
   *  imagem acima das linhas de texto. */
  signatureSrc?: string;
}

interface DocEl {
  type: 'text' | 'image' | 'table' | 'hr';
  text?: string;
  src?: string;
  rows?: TableCellData[][];
  bordered?: boolean;
  style: { bold?: boolean; italic?: boolean; fontSize?: number; align?: string; color?: RGB };
}

/** Converte cor CSS (#rgb, #rrggbb, rgb(...)) para [r,g,b]; undefined se vazia. */
const parseColor = (css: string | null | undefined): RGB | undefined => {
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

/** Divide o conteúdo de uma célula em linhas, respeitando <br> e blocos, e
 *  detetando por linha: negrito (<strong>/<b>), cor e tamanho (span style). */
const cellToLines = (el: HTMLElement, headerBold: boolean): CellLine[] => {
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
  // NÃO filtrar linhas vazias: uma linha sem texto (valor em falta ou <br>
  // extra) vira um espaçador compacto em renderTable — preserva o ritmo e
  // permite separar grupos de campos. Removem-se só vazias no início/fim.
  while (lines.length && !lines[0].text) lines.shift();
  while (lines.length && !lines[lines.length - 1].text) lines.pop();
  return lines;
};

/** Lê um <table> HTML para uma matriz de células com estilo. */
const parseTable = (tableEl: HTMLElement): { rows: TableCellData[][]; bordered: boolean } => {
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
      // Assinatura embebida na célula (marcador inserido por replaceDynamicFields).
      const sigImg = el.querySelector('img.sig-colaborador') as HTMLImageElement | null;
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

interface TableCtx {
  pageHeight: number;
  bottomMargin: number;
  topMargin: number;
  bg: HTMLImageElement | null;
  /** Modo compacto (papel timbrado): padding e entrelinha menores para
   *  recuperar altura útil e caber numa página. */
  compact: boolean;
  /** Imagens de assinatura pré-carregadas (data URL → elemento). renderTable é
   *  síncrono, por isso as imagens têm de vir já resolvidas. */
  signatures?: Map<string, HTMLImageElement>;
}

/**
 * Desenha uma tabela (vetorial) a partir de TableCellData[][]. Suporta:
 * larguras de coluna iguais (+ colspan), wrap de texto, alinhamento,
 * cor de fundo/texto, bordas (opcional) e quebra de página por linha.
 * Devolve o novo yPos.
 */
function renderTable(
  pdf: jsPDF,
  rows: TableCellData[][],
  x: number,
  yStart: number,
  totalW: number,
  bordered: boolean,
  ctx: TableCtx
): number {
  const pad = ctx.compact ? 1.4 : 2;
  const colCount = Math.max(1, ...rows.map((r) => r.reduce((s, c) => s + (c.colspan || 1), 0)));
  const colW = totalW / colCount;
  let y = yStart;

  for (const row of rows) {
    // 1) medir altura da linha — cada célula tem várias linhas (cada uma com
    //    o seu tamanho/negrito/cor); a altura soma as linhas (com wrap).
    type WLine = { text: string; bold: boolean; color?: RGB; fs: number; h: number };
    const layout: Array<{ cell: TableCellData; cx: number; cw: number; wrapped: WLine[] }> = [];
    let cx = x;
    let rowH = 0;
    for (const cell of row) {
      const span = cell.colspan || 1;
      const cw = colW * span;
      const baseFs = cell.fontSize || 9;
      const wrapped: WLine[] = [];
      let cellH = pad * 2;
      for (const ln of cell.lines.length ? cell.lines : [{ text: '', bold: false }]) {
        const fs = ln.fontSize || baseFs;
        // Linha vazia (valor em falta ou <br> separador) → espaçador compacto.
        if (!ln.text || !ln.text.trim()) {
          const gap = fs * 0.352777778 * (ctx.compact ? 0.5 : 0.6);
          wrapped.push({ text: '', bold: false, color: ln.color, fs, h: gap });
          cellH += gap;
          continue;
        }
        const lineH = fs * 0.352777778 * (ctx.compact ? 1.22 : 1.4);
        pdf.setFontSize(fs);
        pdf.setFont('helvetica', ln.bold ? 'bold' : 'normal');
        const parts = pdf.splitTextToSize(ln.text, cw - pad * 2);
        parts.forEach((p: string) => {
          wrapped.push({ text: p, bold: ln.bold, color: ln.color, fs, h: lineH });
          cellH += lineH;
        });
      }
      if (cellH > rowH) rowH = cellH;
      layout.push({ cell, cx, cw, wrapped });
      cx += cw;
    }

    // 2) quebra de página se a linha não couber
    if (y + rowH > ctx.pageHeight - ctx.bottomMargin) {
      pdf.addPage();
      if (ctx.bg) pdf.addImage(ctx.bg, 'PNG', 0, 0, 210, 297);
      y = ctx.topMargin;
    }

    // 3) desenhar células
    for (const cl of layout) {
      if (cl.cell.bg) {
        pdf.setFillColor(cl.cell.bg[0], cl.cell.bg[1], cl.cell.bg[2]);
        pdf.rect(cl.cx, y, cl.cw, rowH, 'F');
      }
      if (bordered || cl.cell.bg) {
        pdf.setDrawColor(220, 222, 228);
        pdf.setLineWidth(0.2);
        pdf.rect(cl.cx, y, cl.cw, rowH, 'S');
      }
      // Assinatura: desenhada SOBRE a primeira linha (o traço ___), assente na
      // linha como uma assinatura real. Não altera a altura da célula.
      const sigImg = cl.cell.signatureSrc ? ctx.signatures?.get(cl.cell.signatureSrc) : undefined;
      if (sigImg && sigImg.width > 0 && sigImg.height > 0) {
        const maxSigW = Math.min(cl.cw - pad * 2, 38); // mm
        const maxSigH = 14; // mm — fica sobre o traço sem invadir o nome
        const aspect = sigImg.width / sigImg.height;
        let sw = maxSigW;
        let sh = sw / aspect;
        if (sh > maxSigH) {
          sh = maxSigH;
          sw = sh * aspect;
        }
        // Assenta a base da imagem ligeiramente acima do traço (1ª linha de texto).
        const firstLineH = cl.wrapped[0]?.h ?? 4;
        const baseLineY = y + pad + firstLineH * 0.82;
        const sx = cl.cx + pad;
        const sy = Math.max(y + 0.5, baseLineY - sh);
        try {
          pdf.addImage(sigImg, 'PNG', sx, sy, sw, sh);
        } catch (err) {
          console.warn('Falha a desenhar a assinatura na célula:', err);
        }
      }

      let lineY = y + pad;
      cl.wrapped.forEach((ln) => {
        const col = ln.color ?? cl.cell.color ?? [30, 30, 35];
        pdf.setTextColor(col[0], col[1], col[2]);
        pdf.setFontSize(ln.fs);
        pdf.setFont('helvetica', ln.bold ? 'bold' : 'normal');
        let tx = cl.cx + pad;
        const opts: any = {};
        if (cl.cell.align === 'center') {
          tx = cl.cx + cl.cw / 2;
          opts.align = 'center';
        } else if (cl.cell.align === 'right') {
          tx = cl.cx + cl.cw - pad;
          opts.align = 'right';
        }
        pdf.text(ln.text, tx, lineY + ln.h * 0.82, opts);
        lineY += ln.h;
      });
    }
    y += rowH;
  }
  pdf.setTextColor(0, 0, 0);
  return y + 2;
}

// Converter HTML para texto simples, preservando formatação para o PDF
const htmlToText = (html: string): DocEl[] => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const elements: DocEl[] = [];

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

      // Detectar cor de texto inline
      const elColor = parseColor(element.style.color);
      if (elColor) style.color = elColor;

      // Divisória horizontal
      if (tagName === 'hr') {
        elements.push({ type: 'hr', style: {} });
        return;
      }

      // Tabelas: layout 2D próprio (caixas / 2 colunas).
      if (tagName === 'table') {
        const { rows, bordered } = parseTable(element);
        if (rows.length > 0) {
          elements.push({ type: 'table', rows, bordered, style: {} });
          elements.push({ type: 'text', text: '\n', style: {} });
        }
        return;
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
  const { templateId, motoristaData, documentData = {}, action = 'print', headerLogoUrl } = params;

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

    // Campos do catálogo criados pelo provider são ALIASES: {{chave}} → {{fonte}}.
    // Substituímos antes da resolução normal para garantir que resolvem sempre.
    let conteudo = templateData.template_data.conteudo as string;
    try {
      const { data: aliases } = await (supabase as any)
        .from('campos_catalogo')
        .select('chave, fonte');
      for (const a of (aliases ?? []) as { chave: string; fonte: string }[]) {
        if (a.chave && a.fonte) {
          conteudo = conteudo.split(`{{${a.chave}}}`).join(`{{${a.fonte}}}`);
        }
      }
    } catch {
      /* tabela ausente ou sem aliases — segue com o conteúdo original */
    }

    // Substituir campos dinâmicos no conteúdo
    const enrichedDocumentData = {
      ...documentData,
      ...(params.km_saida != null ? { km_saida: params.km_saida } : {}),
      ...(params.km_entrada != null ? { km_entrada: params.km_entrada } : {}),
      ...(params.combustivel_saida != null ? { combustivel_saida: params.combustivel_saida } : {}),
      ...(params.combustivel_entrada != null
        ? { combustivel_entrada: params.combustivel_entrada }
        : {}),
    };
    const processedContent = replaceDynamicFields(conteudo, motoristaData, enrichedDocumentData);

    // Suporte ao placeholder {{secao_danos}}: dividir em antes/depois.
    // O bloco de danos (tabela+fotos+QR) é renderizado inline no ponto do placeholder.
    // TipTap envolve o placeholder em <p>...</p> — removemos esses tags residuais.
    const DANOS_PLACEHOLDER = '{{secao_danos}}';
    const hasDanosPlaceholder = processedContent.includes(DANOS_PLACEHOLDER);
    let htmlPart1 = processedContent;
    let htmlPart2 = '';
    if (hasDanosPlaceholder) {
      const idx = processedContent.indexOf(DANOS_PLACEHOLDER);
      let before = processedContent.slice(0, idx);
      let after = processedContent.slice(idx + DANOS_PLACEHOLDER.length);
      before = before.replace(/<p>\s*$/, '');
      after = after.replace(/^\s*<\/p>/, '');
      htmlPart1 = before;
      htmlPart2 = after;
    }

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

    // Logo de cabeçalho (canto superior esquerdo da 1ª página), tamanho fixo.
    // 'PNG' preserva transparência (sem caixa preta de fundo). Só se desenha
    // quando NÃO há papel timbrado — o timbrado já traz a sua própria logo,
    // senão sobrepunha-se (ex.: logo WeGest por cima do timbrado da empresa).
    if (headerLogoUrl && !templateData.papel_timbrado_url) {
      try {
        const logo = await loadImage(headerLogoUrl);
        const logoWidth = 45; // mm
        const logoHeight = logo.width > 0 ? logoWidth * (logo.height / logo.width) : 18;
        pdf.addImage(logo, 'PNG', 15, 12, logoWidth, logoHeight);
      } catch (error) {
        console.warn('Erro ao carregar logo do cabeçalho:', headerLogoUrl, error);
      }
    }

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    // Sem papel timbrado (ex.: contrato de aluguer com logo simples) usamos
    // margens compactas — o documento de 1 página aproveita a folha toda e cabe
    // numa página. Com timbrado mantemos as margens largas que protegem a
    // moldura/faixa amarela da imagem de fundo.
    const hasLetterhead = !!templateData.papel_timbrado_url;
    const leftMargin = hasLetterhead ? 30 : 18;
    const rightMargin = hasLetterhead ? 20 : 18;
    // Sem timbrado mas com logo: o conteúdo começa no topo (~16mm) e a 1ª linha
    // (cabeçalho com Nº à direita) alinha ao lado do logo desenhado em (15,12).
    // Com timbrado: margens "seguras" que evitam sobrepor a logo (topo) e a
    // faixa decorativa (fundo). Defaults 50/38 cobrem timbrados típicos.
    // Cada template pode reduzir-as via template_data.topMargin /
    // template_data.bottomMargin (UI no editor) quando o seu conteúdo precisa
    // de caber numa página única — sem afectar os outros templates.
    const topMarginLetterhead: number =
      typeof templateData.template_data?.topMargin === 'number'
        ? templateData.template_data.topMargin
        : 50;
    const topMargin = hasLetterhead ? topMarginLetterhead : headerLogoUrl ? 16 : 22;
    const bottomMarginLetterhead: number =
      typeof templateData.template_data?.bottomMargin === 'number'
        ? templateData.template_data.bottomMargin
        : 38;
    const bottomMargin = hasLetterhead ? bottomMarginLetterhead : 22;
    const maxWidth = pageWidth - leftMargin - rightMargin;
    let yPos = topMargin;
    // Com papel timbrado a área útil é menor (logo no topo + faixa decorativa no
    // fundo). Comprimir a entrelinha do texto recupera espaço suficiente para
    // contratos caberem numa página sem cortar conteúdo nem tocar no timbrado.
    const lineFactor = hasLetterhead ? 1.24 : 1.5;

    // Processar HTML e renderizar no PDF diretamente
    // Renderiza um bloco de HTML (texto, imagens, tabelas, hr) a partir de yPos,
    // tratando agrupamento, assinaturas e quebras de página. Usado para o
    // conteúdo antes (htmlPart1) e depois (htmlPart2) de {{secao_danos}}.
    const renderHtmlBlock = async (html: string) => {
      const contentElements = htmlToText(html);

      // Pré-carregar imagens de assinatura embebidas em células de tabela.
      // renderTable é síncrono, por isso resolvemos as imagens (data URLs) aqui
      // e passamo-las já carregadas no contexto da tabela.
      const signatures = new Map<string, HTMLImageElement>();
      const sigSrcs = new Set<string>();
      for (const el of contentElements) {
        if (el.type === 'table' && el.rows) {
          for (const row of el.rows) {
            for (const cell of row) {
              if (cell.signatureSrc) sigSrcs.add(cell.signatureSrc);
            }
          }
        }
      }
      for (const src of sigSrcs) {
        try {
          signatures.set(src, await loadImage(src));
        } catch (err) {
          console.warn('Falha a carregar a imagem da assinatura:', err);
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
        }>;
      } | null = null;

      for (const element of contentElements) {
        if (element.type === 'image' || element.type === 'table' || element.type === 'hr') {
          // Imagens, tabelas e divisórias criam sempre o seu próprio grupo.
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
              },
            ],
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
          yPos += 10 * 0.352777778 * lineFactor; // espaçador de parágrafo (entrelinha)
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

        // Se for tabela (layout 2D próprio)
        if (group.segments[0].isTable) {
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

        // Se for divisória (<hr>)
        if (group.segments[0].isHr) {
          yPos += 1;
          pdf.setDrawColor(224, 226, 232);
          pdf.setLineWidth(0.3);
          pdf.line(leftMargin, yPos, pageWidth - rightMargin, yPos);
          yPos += 3;
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
                const lineHeight = maxFontSize * 0.352777778 * lineFactor;
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
    }; // fim renderHtmlBlock

    await renderHtmlBlock(htmlPart1);

    // Anexar fotos (check-in/check-out) em folhas próprias, grelha 2×3.
    if (params.anexoFotos?.length) {
      const cols = 2;
      const rows = 3;
      const gap = 6;
      const cellW = (maxWidth - gap * (cols - 1)) / cols;
      const gridTop = topMargin + 10; // abaixo do título da secção
      const cellH = (pageHeight - bottomMargin - gridTop - gap * (rows - 1)) / rows;

      const novaFolha = (titulo: string) => {
        pdf.addPage();
        if (bg) pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(43, 58, 107);
        pdf.text(titulo, leftMargin, topMargin + 4);
        pdf.setTextColor(0, 0, 0);
      };

      // Pré-carregar TODAS as imagens em paralelo — uma a uma (await em loop)
      // era N× a latência de rede. Falhas individuais ficam fora do mapa
      // (a célula fica só com a moldura).
      const urlsUnicas = [...new Set(params.anexoFotos.flatMap((g) => g.urls))];
      const imagens = new Map<string, HTMLImageElement>();
      await Promise.all(
        urlsUnicas.map(async (url) => {
          try {
            imagens.set(url, await loadImage(url));
          } catch (error) {
            console.warn('Erro ao carregar foto do anexo:', url, error);
          }
        })
      );

      pdf.setDrawColor(220, 222, 228);
      pdf.setLineWidth(0.2);
      for (const grupo of params.anexoFotos) {
        if (!grupo.urls.length) continue;
        let idx = 0;
        for (const url of grupo.urls) {
          const posInPage = idx % (cols * rows);
          if (posInPage === 0) novaFolha(idx === 0 ? grupo.titulo : `${grupo.titulo} (cont.)`);
          const r = Math.floor(posInPage / cols);
          const c = posInPage % cols;
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

    // Para templates do tipo anexo_danos, buscar danos automaticamente se não fornecidos.
    let efectivoAnexoDanos = params.anexoDanos;
    if (templateData.tipo === 'anexo_danos' && params.viaturaId && !efectivoAnexoDanos) {
      const matricula = (documentData?.viatura_matricula as string | undefined) ?? '';
      efectivoAnexoDanos = await fetchAnexoDanos(params.viaturaId, matricula, params.contratoId);
      if (!efectivoAnexoDanos) {
        console.warn('Template anexo_danos: viatura sem danos activos ou erro ao buscar');
      }
    }

    // Anexar folha de danos da viatura (lista + fotos máx 6 + QR code).
    if (efectivoAnexoDanos) {
      const ad = efectivoAnexoDanos;
      const blue: [number, number, number] = [43, 58, 107];
      const gray: [number, number, number] = [90, 90, 100];
      const borderColor: [number, number, number] = [200, 202, 210];

      // Se o template usa {{secao_danos}}, renderizar inline (sem nova página).
      // Caso contrário (append clássico), forçar nova página sem papel timbrado.
      const danosInline = hasDanosPlaceholder;
      const adPage = () => {
        pdf.addPage();
        pdf.setDrawColor(...blue);
        pdf.setLineWidth(0.5);
        pdf.line(leftMargin, 8, pageWidth - rightMargin, 8);
        pdf.setLineWidth(0.2);
      };

      if (!danosInline) adPage();

      const LOCALIZACAO_LABELS: Record<string, string> = {
        frente: 'Frente',
        traseira: 'Traseira',
        lateral_esq: 'Lat. Esq.',
        lateral_dir: 'Lat. Dir.',
        teto: 'Teto',
        interior: 'Interior',
        motor: 'Motor',
        outro: 'Outro',
      };
      const ESTADO_LABELS: Record<string, string> = {
        existente: 'Existente',
        em_reparacao: 'Em reparação',
        reparado: 'Reparado',
        irreparavel: 'Irreparável',
        pendente: 'Pendente',
      };

      // — Título do anexo —
      const danosStartY = danosInline ? yPos + 6 : topMargin;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...blue);
      pdf.text(ad.titulo, leftMargin, danosStartY + 4);
      pdf.setTextColor(0, 0, 0);

      let ty = danosStartY + 12;

      // — Fotos (grelha 2×3, máx 6) — vêm ANTES da tabela —
      if (ad.fotos.length > 0) {
        const photoCols = 2;
        const photoRows = Math.ceil(Math.min(ad.fotos.length, 6) / photoCols);
        const photoGap = 4;
        const photoW = (maxWidth - photoGap) / photoCols;
        const photoH = 38;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(...gray);
        const totalFotos = ad.fotos.length;
        const mostradas = Math.min(totalFotos, 6);
        const labelFotos =
          totalFotos > 6
            ? `FOTOS DOS DANOS (${mostradas} de ${totalFotos} — ver restantes via QR)`
            : `FOTOS DOS DANOS (${mostradas})`;
        pdf.text(labelFotos, leftMargin, ty);
        ty += 5;

        // Pré-carregar fotos em paralelo
        const fotoUrls = ad.fotos.slice(0, 6);
        const fotoImagens = new Map<string, HTMLImageElement>();
        await Promise.all(
          fotoUrls.map(async (url) => {
            try {
              fotoImagens.set(url, await loadImage(url));
            } catch {
              // célula fica só com moldura
            }
          })
        );

        pdf.setDrawColor(...borderColor);
        pdf.setLineWidth(0.2);
        pdf.setTextColor(0, 0, 0);
        for (let fi = 0; fi < fotoUrls.length; fi++) {
          const fc = fi % photoCols;
          const fr = Math.floor(fi / photoCols);
          const fx = leftMargin + fc * (photoW + photoGap);
          const fy = ty + fr * (photoH + photoGap);
          pdf.rect(fx, fy, photoW, photoH, 'S');
          const img = fotoImagens.get(fotoUrls[fi]);
          if (img) {
            const ratio = img.width && img.height ? img.width / img.height : 1.5;
            let w = photoW - 2;
            let h = w / ratio;
            if (h > photoH - 2) {
              h = photoH - 2;
              w = h * ratio;
            }
            pdf.addImage(img, 'JPEG', fx + (photoW - w) / 2, fy + (photoH - h) / 2, w, h);
          }
        }
        ty += photoRows * (photoH + photoGap) + 6;
      }

      // — Tabela de danos —
      if (ad.danos.length === 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(9);
        pdf.setTextColor(...gray);
        pdf.text('Nenhum dano activo registado.', leftMargin, ty + 4);
        ty += 12;
      } else {
        const colW = [32, 72, 28, 22, 22];
        const headers = ['Localização', 'Descrição', 'Estado', 'Data', 'Valor'];
        const rowH = 7;
        const headerH = 8;

        // Nova página se não couber tabela + QR (mínimo 3 linhas + QR = ~60mm)
        if (ty + headerH + rowH + 44 > pageHeight - bottomMargin) {
          adPage();
          ty = topMargin + 8;
        }

        pdf.setDrawColor(...borderColor);
        pdf.setLineWidth(0.2);
        pdf.setFillColor(240, 242, 248);

        // Header row
        pdf.rect(
          leftMargin,
          ty,
          colW.reduce((a, b) => a + b, 0),
          headerH,
          'FD'
        );
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(...blue);
        let cx = leftMargin;
        for (let ci = 0; ci < headers.length; ci++) {
          pdf.text(headers[ci], cx + 2, ty + headerH - 2.5);
          cx += colW[ci];
        }
        ty += headerH;

        // Data rows
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(30, 30, 40);
        for (const dano of ad.danos) {
          if (ty + rowH > pageHeight - bottomMargin - 44) {
            adPage();
            ty = topMargin + 8;
          }
          const rowData = [
            LOCALIZACAO_LABELS[dano.localizacao] ?? dano.localizacao,
            dano.descricao,
            ESTADO_LABELS[dano.estado] ?? dano.estado,
            dano.data,
            dano.valor ?? '—',
          ];
          cx = leftMargin;
          pdf.setDrawColor(...borderColor);
          for (let ci = 0; ci < rowData.length; ci++) {
            pdf.rect(cx, ty, colW[ci], rowH, 'S');
            const cellText = pdf.splitTextToSize(rowData[ci], colW[ci] - 3);
            pdf.text(cellText[0] ?? '', cx + 2, ty + rowH - 2);
            cx += colW[ci];
          }
          ty += rowH;
        }
        ty += 6;
      } // end else (danos.length > 0)

      // — QR code + link —
      if (ty + 44 > pageHeight - bottomMargin) {
        adPage();
        ty = topMargin + 8;
      }
      const qrSize = 36;
      pdf.addImage(ad.qrCodeDataUrl, 'PNG', leftMargin, ty, qrSize, qrSize);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...gray);
      pdf.text('Ver todas as fotos e danos:', leftMargin + qrSize + 4, ty + 10);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...blue);
      pdf.text(ad.linkUrl, leftMargin + qrSize + 4, ty + 17);
      pdf.setTextColor(0, 0, 0);

      // Actualizar yPos para conteúdo após a secção de danos (htmlPart2).
      if (danosInline) yPos = ty + qrSize + 8;
    }

    // Renderizar conteúdo após {{secao_danos}} (texto, tabelas de assinatura, etc.).
    if (hasDanosPlaceholder && htmlPart2.trim()) {
      await renderHtmlBlock(htmlPart2);
    }

    // Adicionar numeração de páginas (apenas deste documento, não de PDFs anteriores)
    // skipFooter: quem orquestra (ex: contrato de aluguer) faz um rodapé unificado.
    const endPage = pdf.getNumberOfPages();
    const docTotalPages = endPage - startPage + 1;
    // Com papel timbrado, o rodapé da empresa já vem na imagem — não desenhar
    // o footerText por cima; usa-se só a numeração discreta.
    const usarFooterEmpresa = !!params.footerText && !templateData.papel_timbrado_url;
    for (let i = startPage; i <= endPage && !params.skipFooter; i++) {
      pdf.setPage(i);
      pdf.setFontSize(usarFooterEmpresa ? 7.5 : 9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(138, 141, 153);
      const pageText = `Página ${i - startPage + 1} de ${docTotalPages}`;
      if (usarFooterEmpresa) {
        // Rodapé da empresa (esquerda) + numeração (direita), sobre uma linha
        // fina — só quando há footerText e não há papel timbrado.
        const footerY = pageHeight - 14;
        pdf.setDrawColor(220, 222, 228);
        pdf.setLineWidth(0.2);
        pdf.line(leftMargin, footerY - 4, pageWidth - rightMargin, footerY - 4);
        pdf.text(params.footerText, leftMargin, footerY);
        const pw = pdf.getTextWidth(pageText);
        pdf.text(pageText, pageWidth - rightMargin - pw, footerY);
      } else {
        const textWidth = pdf.getTextWidth(pageText);
        // Com timbrado: colocar a numeração logo abaixo do fim do conteúdo
        // (bottomMargin - 6mm), nunca dentro da faixa decorativa inferior que
        // começa tipicamente ~25mm da base — a fórmula anterior (pageHeight-18)
        // ficava dentro da faixa. Sem timbrado: canto inferior como antes.
        const numY = hasLetterhead ? pageHeight - bottomMargin + 6 : pageHeight - 18;
        pdf.text(pageText, pageWidth - rightMargin - textWidth, numY);
      }
    }

    // Executar ação (imprimir ou download)
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
};

/** Um documento a incluir no PDF combinado (mesmos campos do gerador). */
export type DocumentoCombinado = Pick<
  GenerateDocumentParams,
  | 'templateId'
  | 'motoristaData'
  | 'documentData'
  | 'headerLogoUrl'
  | 'footerText'
  | 'anexoFotos'
  | 'anexoDanos'
  | 'viaturaId'
  | 'contratoId'
>;

/**
 * Gera vários documentos (templates) num ÚNICO PDF, com uma folha branca a
 * separar cada documento. Cada documento mantém a sua própria numeração e
 * rodapé. Usado, p.ex., no regime TVDE/slot (Contrato de Prestação + Contrato
 * de Aluguer). Ordem do array = ordem no PDF.
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
    // Folha branca a separar do próximo documento (o motor adiciona depois a
    // página de conteúdo do documento seguinte por cima desta separação).
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
