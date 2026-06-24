export const TIPOS_DOCUMENTO = [
  'Cartão Cidadão',
  'Passaporte',
  'Autorização de Residência',
  'Carta de Condução',
  'Outro',
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export type Documento = {
  id: string;
  tipo: TipoDocumento;
  numero: string | null;
  pais_emissao: string | null;
  data_emissao: string | null;
  validade: string | null;
  arquivo_url: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClienteDocumento = {
  id: string;
  cliente_id: string;
  documento_id: string;
  created_by: string | null;
  created_at: string;
};

export type ClienteAnexo = {
  id: string;
  cliente_id: string;
  nome: string;
  ficheiro_url: string;
  tamanho_bytes: number | null;
  descricao: string | null;
  created_by: string | null;
  created_at: string;
};

export type Genero = 'M' | 'F' | 'Outro';

export const TIPOS_CLIENTE = ['particular', 'empresa', 'condutor'] as const;
export type TipoCliente = (typeof TIPOS_CLIENTE)[number];

export const TIPO_CLIENTE_LABELS: Record<TipoCliente, string> = {
  particular: 'Particular',
  empresa: 'Empresa',
  condutor: 'Condutor',
};

export type Cliente = {
  id: string;
  org_id: string;
  codigo: number;
  is_empresa: boolean;
  /** True nas empresas EMISSORAS (do grupo) — distingue-as dos clientes que são empresas. */
  is_emissora: boolean;
  /** Classificação: particular | empresa | condutor. Sincroniza is_empresa. */
  tipo_cliente: TipoCliente;
  nome: string; // pessoa: nome completo · empresa: denominação social
  nome_comercial: string | null; // só empresa
  nif: string | null;
  telefone: string | null;
  email: string | null;
  iban: string | null;
  data_nascimento: string | null; // só pessoa
  naturalidade: string | null; // só pessoa
  genero: Genero | null; // só pessoa
  observacoes: string | null;
  morada: string | null;
  codigo_postal: string | null;
  localidade: string | null;
  cidade: string | null;
  pais: string | null;
  // campos usados quando tipo_cliente='empresa'
  sede: string | null;
  representante: string | null;
  cargo_representante: string | null;
  licenca_tvde: string | null;
  licenca_validade: string | null;
  papel_timbrado: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClienteComDocumentos = Cliente & {
  documentoIdentificacao: Documento | null;
  cartaConducao: Documento | null;
  ligacaoDocumento: ClienteDocumento | null;
  ligacaoCarta: ClienteDocumento | null;
};
