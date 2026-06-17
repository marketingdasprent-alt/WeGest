// Faturação fiscal — tipos do cliente frontend (provider-agnostic).
// A emissão é feita server-side pela edge function `faturacao-emitir`, que
// despacha para o provider configurado por organização. O frontend só envia o
// payload e lê `invoices`.

export type TipoFatura = 'FT' | 'FR' | 'NC' | 'RC'; // Fatura, Fatura-Recibo, Nota de Crédito, Recibo

export interface ItemFatura {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  taxa_iva: number; // 0, 6, 13, 23
  ref?: string;
  id_produto?: string; // id do artigo no provider (se conhecido)
  id_tax?: string; // id de IVA no provider (se já conhecido)
  desconto?: number; // %
}

export interface ClienteFatura {
  nome: string;
  nif?: string;
  email?: string;
  morada?: string;
  codigo_postal?: string;
  localidade?: string;
  country_code?: string; // ISO-3166 alpha-2 (default PT)
}

/** Body enviado à edge function `faturacao-emitir` (action 'emit'). */
export interface CreateFaturaPayload {
  tipo: TipoFatura;
  cliente: ClienteFatura;
  itens: ItemFatura[];
  contrato_id?: string;
  cobranca_id?: string;
  observacoes?: string;
  referencia_externa?: string; // ex.: número do contrato
  documento_referencia?: string; // obrigatório p/ NC (documento original)
}

/** Resposta da edge function (emissão). */
export interface EmitResult {
  success: boolean;
  error?: string;
  warning?: string;
  invoice?: InvoiceMetadata;
  /** Identificação devolvida pelo provider de faturação. */
  provider?: {
    DocType: string;
    DocSeries: string;
    DocNum: string;
    FullDocNumber: string;
    total: number;
  };
}

/** Linha da tabela `invoices` (espelho local do documento fiscal emitido). */
export interface InvoiceMetadata {
  id: string;
  org_id: string;
  contrato_id: string | null;
  cobranca_id: string | null;
  tipo: TipoFatura;
  provider: string | null; // slug do provider que emitiu (ex.: 'keyinvoice')
  provider_doctype: string | null; // DocType do provider (p/ obter o PDF)
  provider_docnum: string | null; // DocNum do provider (p/ obter o PDF)
  serie: string | null; // DocSeries
  numero: string | null; // FullDocNumber (nº legal apresentável)
  data_emissao: string | null;
  total: number | null;
  cliente_nif: string | null;
  referencia_externa: string | null;
  observacoes: string | null;
  status: 'emitida' | 'erro' | 'anulada';
  erro_msg: string | null;
  created_at: string;
  updated_at: string;
}
