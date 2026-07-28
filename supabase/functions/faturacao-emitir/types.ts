// ============================================================
// Tipos partilhados da edge function de faturação (provider-agnostic)
// ============================================================
// O handler `index.ts` é genérico: resolve a config da org e despacha
// para o adapter do provider configurado. Cada adapter (ex.: KeyInvoice)
// implementa `FaturacaoProvider` e aplica os seus próprios defaults.

export interface Item {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  taxa_iva: number; // 0, 6, 13, 23
  ref?: string;
  id_produto?: string;
  id_tax?: string;
  desconto?: number; // %
}

export interface Cliente {
  nome: string;
  nif?: string;
  email?: string;
  morada?: string;
  codigo_postal?: string;
  localidade?: string;
  country_code?: string; // ISO-3166 alpha-2 (default PT)
}

export interface EmitInput {
  tipo: 'FT' | 'FR' | 'NC' | 'RC';
  cliente: Cliente;
  itens: Item[];
  observacoes?: string;
  referencia_externa?: string;
  documento_referencia?: string; // obrigatório p/ NC e RC
}

export interface PdfInput {
  doctype: string;
  docnum: string;
  serie?: string;
  signed?: boolean;
}

/**
 * Config do provider já resolvida (vinda da org em `plataformas_configuracao`
 * ou de um teste de ligação). O adapter aplica os seus próprios defaults e
 * fallbacks (ex.: secrets do deployment) por cima disto.
 */
export interface ProviderConfig {
  /** Chave da API (plataformas_configuracao.client_secret). */
  apiKey?: string | null;
  /** Settings específicos do provider (plataformas_configuracao.config jsonb). */
  settings?: Record<string, unknown> | null;
}

/** Identificadores genéricos devolvidos pela emissão. */
export interface EmitDocResult {
  doctype: string;
  docnum: string;
  serie: string;
  numero: string; // nº legal apresentável (FullDocNumber)
  raw: unknown; // resposta crua do provider (auditoria)
}

/** Contrato que cada provider de faturação implementa. */
export interface FaturacaoProvider {
  /** Confirma que as credenciais autenticam. Lança em caso de falha. */
  health(cfg: ProviderConfig): Promise<void>;
  /** Emite um documento fiscal. Lança em caso de falha. */
  emit(input: EmitInput, cfg: ProviderConfig): Promise<EmitDocResult>;
  /** Devolve o PDF (base64) de um documento já emitido. */
  pdf(input: PdfInput, cfg: ProviderConfig): Promise<string>;
  /** Confirma se o provider tem o doctype do tipo indicado configurado (config da org OU fallback do deployment). Usado no pré-voo, antes de se aceitar criar um acordo de parcelamento. */
  hasDoctype(tipo: EmitInput['tipo'], cfg: ProviderConfig): boolean;
}

/**
 * Erro que um adapter lança quando NÃO é possível confirmar se um documento
 * chegou a ser criado no provider antes da falha (timeout, ligação perdida,
 * resposta ilegível). Distinto de um Error normal, que significa que o
 * provider respondeu e recusou, ou que a falha ocorreu antes de qualquer
 * tentativa de criação — nesses dois casos sabe-se que nada foi criado.
 * Um chamador NUNCA deve reemitir automaticamente depois deste erro; precisa
 * de reconciliar (confirmar manualmente no provider) primeiro.
 */
export class EmissaoAmbiguaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmissaoAmbiguaError';
  }
}
