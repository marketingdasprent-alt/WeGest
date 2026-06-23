/**
 * Funções puras que constroem os payloads enviados aos mutations.
 * Sem dependências de React/form — fácil de testar isoladamente.
 */
import type { TipoDocumento } from '@/types/cliente';
import {
  TIPO_CARTA,
  TIPOS_DOC_IDENTIFICACAO,
  isTipoDocumento,
  type ClienteFormData,
} from './clienteDialog.schema';

// ── Cliente ───────────────────────────────────────────────────
export type ClientePayload = {
  tipo_cliente: 'particular' | 'empresa' | 'condutor';
  is_empresa: boolean;
  nome: string;
  nome_comercial: string | null;
  nif: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  naturalidade: string | null;
  genero: 'M' | 'F' | 'Outro' | null;
  iban: string | null;
  observacoes: string | null;
  morada: string | null;
  codigo_postal: string | null;
  localidade: string | null;
  cidade: string | null;
  pais: string;
};

export function buildClientePayload(values: ClienteFormData): ClientePayload {
  const isEmp = values.tipo_cliente === 'empresa';
  return {
    tipo_cliente: values.tipo_cliente,
    is_empresa: isEmp,
    nome: values.nome,
    nome_comercial: isEmp ? values.nome_comercial || null : null,
    nif: values.nif || null,
    telefone: values.telefone || null,
    email: values.email || null,
    data_nascimento: values.data_nascimento || null,
    naturalidade: isEmp ? null : values.naturalidade || null,
    genero: isEmp ? null : values.genero ? (values.genero as 'M' | 'F' | 'Outro') : null,
    iban: values.iban || null,
    observacoes: values.observacoes || null,
    morada: values.morada || null,
    codigo_postal: values.codigo_postal || null,
    localidade: values.localidade || null,
    cidade: values.cidade || null,
    pais: values.pais || 'Portugal',
  };
}

// ── Documento de identificação ────────────────────────────────
export type DocumentoPayload = {
  tipo: TipoDocumento;
  numero: string | null;
  pais_emissao: string | null;
  data_emissao: string | null;
  validade: string | null;
  arquivo_url: string | null;
};

export function buildDocumentoPayload(values: ClienteFormData): DocumentoPayload {
  // Se o utilizador não escolheu um tipo válido, fica 'Outro' como fallback.
  const tipo: TipoDocumento = isTipoDocumento(values.doc_tipo) ? values.doc_tipo : 'Outro';
  return {
    tipo,
    numero: values.doc_numero || null,
    pais_emissao: values.doc_pais_emissao || null,
    data_emissao: values.doc_data_emissao || null,
    validade: values.doc_validade || null,
    arquivo_url: null,
  };
}

// ── Carta de condução ─────────────────────────────────────────
export function buildCartaPayload(values: ClienteFormData): DocumentoPayload {
  return {
    tipo: TIPO_CARTA,
    numero: values.carta_numero || null,
    pais_emissao: values.carta_pais || null,
    data_emissao: values.carta_data_emissao || null,
    validade: values.carta_validade || null,
    arquivo_url: null,
  };
}

// Re-export para evitar imports duplicados nos chamadores
export { TIPO_CARTA, TIPOS_DOC_IDENTIFICACAO };
