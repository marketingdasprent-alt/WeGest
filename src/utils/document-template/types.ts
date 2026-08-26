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
  /** Descrição escrita por quem tirou a foto/vídeo (viatura_dano_fotos.descricao).
   *  Quando existe, é ela que aparece na legenda: diz o que se está a ver
   *  ("risco no para-choques traseiro"), enquanto a origem só diz de onde veio. */
  descricao?: string;
  /** Ficheiro de vídeo. A grelha do PDF não consegue mostrar um frame, por isso
   *  marca-se a moldura como vídeo e remete-se para o QR. */
  video?: boolean;
  /** Anexo em PDF (peritagem, orçamento de oficina). Também não se desenha na
   *  grelha — moldura rotulada e o conteúdo vê-se pelo QR. */
  pdf?: boolean;
}

/** Uma parte identificada no contrato — o titular e/ou quem conduz. */
export interface AnexoParteItem {
  /** 'CLIENTE', 'CONDUTOR', 'CLIENTE / CONDUTOR' quando são a mesma entidade. */
  papel: string;
  nome: string;
  /** Linhas soltas já formatadas (NIF, contacto, morada) — só as que existem. */
  detalhes: string[];
}

/** Anexo de danos da viatura: lista + fotos (máx 6) + QR code. */
export interface AnexoDanos {
  titulo: string;
  /** Código do contrato de renting. Vai para o canto superior direito da
   *  página e para o placeholder {{numero_contrato}}. */
  numeroContrato?: number;
  /** Quem alugou: titular do contrato e/ou condutor, conforme o que estiver
   *  preenchido. Vazio quando o contrato não tem nenhum dos dois. */
  partes?: AnexoParteItem[];
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
  /**
   * Template já resolvido, em vez de ser lido da base de dados por `templateId`.
   *
   * Serve a regeneração a partir de uma fotografia congelada (ver `snapshot.ts`):
   * um documento enviado para assinar tem de continuar a produzir-se igual mesmo
   * que alguém edite o template entretanto, senão a pessoa acaba a assinar coisa
   * diferente da que recebeu.
   */
  templateOverride?: DocumentTemplate;
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
  /**
   * Estamos no momento de entrega/recolha deste contrato?
   *
   * `contratoId` faz duas coisas na folha de danos e nem sempre se querem as
   * duas: identifica o documento (número no canto, partes, QR do contrato) e
   * rotula os danos deste contrato como "Nesta recolha/entrega".
   *
   * No fecho/handover as duas fazem sentido → true (omissão).
   * A imprimir do botão "Documentos" do contrato não há handover nenhum, e
   * "Nesta recolha/entrega" seria mentira: os danos saem rotulados
   * "Contrato #N" e mantém-se todo o resto → false.
   */
  folhaDanosMomentoActual?: boolean;
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
  /** `pagebreak` = quebra de página manual inserida no editor de templates. */
  type: 'text' | 'image' | 'table' | 'hr' | 'pagebreak';
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
  | 'folhaDanosMomentoActual'
>;
