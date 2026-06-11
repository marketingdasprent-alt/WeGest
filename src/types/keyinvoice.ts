// KeyInvoice API tipos e schemas
export type TipoFatura = 'FT' | 'FR' | 'NC'; // Fatura, Fatura-Recibo, Nota de Crédito

export interface ItemFatura {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  taxa_iva: number; // 0, 6, 13, 23
}

export interface CreateFaturaPayload {
  tipo: TipoFatura;
  cliente_nome: string;
  cliente_nif: string;
  cliente_email?: string;
  cliente_morada?: string;
  cliente_codigo_postal?: string;
  cliente_localidade?: string;
  cliente_pais?: string;
  data?: string; // YYYY-MM-DD, default hoje
  itens: ItemFatura[];
  observacoes?: string;
  referencia_externa?: string; // ex: número do contrato
  fatura_original_id?: string; // para NC (Nota de Crédito)
}

export interface FaturaResponse {
  id: string;
  numero: string;
  serie: string;
  data: string;
  url_pdf: string;
  status: string;
  total: number;
}

export interface KeyInvoiceRequest {
  m: string; // 'create_document', 'get_document', etc
  tipo_documento?: string; // 'FT', 'FR', 'NC'
  cliente?: {
    nome: string;
    nif: string;
    email?: string;
    morada?: string;
    codigo_postal?: string;
    localidade?: string;
    pais?: string;
  };
  data_emissao?: string;
  descricao?: string;
  itens?: Array<{
    descricao: string;
    quantidade: number;
    valor_unitario: number;
    taxa_iva: number;
  }>;
  observacoes?: string;
  referencia_externa?: string;
  documento_referencia?: string; // para NC
}

export interface InvoiceMetadata {
  id: string;
  org_id: string;
  contrato_id: string;
  tipo: TipoFatura;
  keyinvoice_numero: string;
  keyinvoice_serie: string;
  keyinvoice_data: string;
  url_pdf: string;
  total: number;
  created_at: string;
  updated_at: string;
}
