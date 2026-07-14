import type jsPDF from 'jspdf';

/** Dano de viatura para o anexo do contrato. */
export interface AnexoDanoItem {
  localizacao: string;
  descricao: string;
  estado: string;
  data: string;
  valor?: string;
  /** De onde vem o registo — distingue danos já existentes na viatura (e a
   *  sua origem) dos que estão a ser adicionados agora nesta recolha/entrega. */
  origem?: string;
}

/** Foto da grelha de danos — com legenda de origem (de onde veio). */
export interface AnexoFotoItem {
  url: string;
  /** Legenda por baixo da foto — mesma origem usada na tabela de danos. */
  origem?: string;
}

/** Anexo de danos da viatura: lista + fotos (máx 6) + QR code. */
export interface AnexoDanos {
  titulo: string;
  danos: AnexoDanoItem[];
  /** URLs já assinadas (máx 6) para a grelha de fotos, com legenda de origem. */
  fotos: AnexoFotoItem[];
  /** URL da página de danos da viatura (texto + QR). */
  linkUrl: string;
  /** data:image/png;base64 do QR code. */
  qrCodeDataUrl: string;
}

export interface DocumentTemplate {
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

export interface GenerateDocumentParams {
  templateId: string;
  motoristaData: Record<string, any>;
  documentData?: Record<string, any>;
  action?: 'print' | 'download';
  skipOutput?: boolean;
  skipFooter?: boolean;
  existingPdf?: jsPDF;
  headerLogoUrl?: string;
  footerText?: string;
  anexoFotos?: Array<{ titulo: string; urls: string[] }>;
  anexoDanos?: AnexoDanos;
  viaturaId?: string;
  contratoId?: string;
  km_saida?: string;
  km_entrada?: string;
  combustivel_saida?: string;
  combustivel_entrada?: string;
  /** Nível de bateria (%) — viaturas elétricas/híbridas. Paralelo a combustivel_saida/entrada. */
  eletricidade_saida?: string;
  eletricidade_entrada?: string;
  momentoFolha?: string;
  fotosMomento?: string[];
  danosMomento?: AnexoDanoItem[];
  observacoesMomento?: string;
}

export interface UploadDocumentParams extends GenerateDocumentParams {
  contratoId: string;
}

export type RGB = [number, number, number];

export interface CellLine {
  text: string;
  bold: boolean;
  color?: RGB;
  fontSize?: number;
}

export interface TableCellData {
  lines: CellLine[];
  align?: string;
  bg?: RGB;
  color?: RGB;
  fontSize?: number;
  colspan: number;
  signatureSrc?: string;
}

export interface DocEl {
  type: 'text' | 'image' | 'table' | 'hr';
  text?: string;
  src?: string;
  rows?: TableCellData[][];
  bordered?: boolean;
  style: { bold?: boolean; italic?: boolean; fontSize?: number; align?: string; color?: RGB };
}

export interface TableCtx {
  pageHeight: number;
  bottomMargin: number;
  topMargin: number;
  bg: HTMLImageElement | null;
  compact: boolean;
  signatures?: Map<string, HTMLImageElement>;
}

export interface PageLayout {
  leftMargin: number;
  rightMargin: number;
  topMargin: number;
  pageWidth: number;
  pageHeight: number;
  bottomMargin: number;
  maxWidth: number;
  lineFactor: number;
  hasLetterhead: boolean;
}

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
