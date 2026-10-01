import type { ExtraTipoCalculo } from './rentingExtra';

export const CONTRATO_ESTADOS_OP = [
  'agendado',
  'em_curso',
  'fechado',
  'cancelado',
  'devolvido',
] as const;
export type ContratoEstadoOperacional = (typeof CONTRATO_ESTADOS_OP)[number];

export const CONTRATO_ESTADO_OP_LABELS: Record<ContratoEstadoOperacional, string> = {
  agendado: 'Agendado',
  em_curso: 'Em Curso',
  fechado: 'Fechado',
  cancelado: 'Cancelado',
  devolvido: 'Fechado',
};

export const CONTRATO_TIPOS_FECHO = ['recolhido', 'devolvido'] as const;
export type ContratoTipoFecho = (typeof CONTRATO_TIPOS_FECHO)[number];

export const CONTRATO_TIPO_FECHO_LABELS: Record<ContratoTipoFecho, string> = {
  recolhido: 'Recolhido',
  devolvido: 'Devolvido',
};

export const CONTRATO_ESTADOS_FIN = ['pendente', 'facturado', 'pago', 'anulado'] as const;
export type ContratoEstadoFinanceiro = (typeof CONTRATO_ESTADOS_FIN)[number];

export const CONTRATO_ESTADO_FIN_LABELS: Record<ContratoEstadoFinanceiro, string> = {
  pendente: 'Pendente',
  facturado: 'Facturado',
  pago: 'Pago',
  anulado: 'Anulado',
};

export const CONTRATO_ORIGENS = ['sistema', 'online', 'telefone', 'balcao'] as const;
export type ContratoOrigem = (typeof CONTRATO_ORIGENS)[number];

export const CONTRATO_ORIGEM_LABELS: Record<ContratoOrigem, string> = {
  sistema: 'Sistema',
  online: 'Online',
  telefone: 'Telefone',
  balcao: 'Balcão',
};

export const CONTRATO_MODALIDADES = ['rent_a_car', 'tvde'] as const;
export type ContratoModalidade = (typeof CONTRATO_MODALIDADES)[number];

export const CONTRATO_MODALIDADE_LABELS: Record<ContratoModalidade, string> = {
  rent_a_car: 'Rent-a-car',
  tvde: 'TVDE',
};

export const CONTRATO_RENOVACAO_OPCOES = [
  'primeiro_dia_mes',
  'mesmo_dia_cada_mes',
  'intervalo_dias',
] as const;
export type ContratoRenovacaoOpcao = (typeof CONTRATO_RENOVACAO_OPCOES)[number];

export const CONTRATO_RENOVACAO_OPCAO_LABELS: Record<ContratoRenovacaoOpcao, string> = {
  primeiro_dia_mes: 'Ao primeiro dia de cada mês',
  mesmo_dia_cada_mes: 'No mesmo dia em cada mês',
  intervalo_dias: 'A cada intervalo específico de dias',
};

export const CONTRATO_REGIMES = ['rent_a_car', 'tvde', 'slot'] as const;
export type ContratoRegime = (typeof CONTRATO_REGIMES)[number];

export const CONTRATO_REGIME_LABELS: Record<ContratoRegime, string> = {
  rent_a_car: 'Rent-a-Car',
  tvde: 'TVDE',
  slot: 'Slot',
};

export type ContratoRenting = {
  id: string;
  org_id: string;
  codigo: number;

  reserva_id: string;

  cliente_id: string;

  emissor_id: string | null;

  gestor_id: string | null;

  viatura_id: string;
  matricula: string | null;
  grupo: string | null;

  estacao_entrega_id: string | null;
  data_inicio: string;

  estacao_recolha_id: string | null;

  data_fim: string | null;

  estacao_origem_viatura_id: string | null;

  estado_operacional: ContratoEstadoOperacional;
  estado_financeiro: ContratoEstadoFinanceiro;
  origem: ContratoOrigem;

  regime: ContratoRegime;

  tarifa_diaria: number | null;

  tarifa_id: string | null;
  desconto_percentagem: number | null;

  taxa_iva: number;
  valor_total_manual: number | null;

  total_subtotal: number | null;
  total_iva: number | null;
  total_final: number | null;
  facturado_em: string | null;

  total_calculado?: number | null;

  is_longa_duracao: boolean;
  renovacao_opcao: ContratoRenovacaoOpcao | null;
  renovacao_intervalo_dias: number | null;
  /** TVDE: próxima renovação — é o que renovar avança (não cria versão nem
   *  mexe na data de início). Opcional: nem todas as queries a seleccionam. */
  proxima_renovacao_em?: string | null;

  franquia_valor: number | null;
  caucao_valor: number | null;
  kms_incluidos: number | null;
  km_adicional_valor: number | null;

  km_saida: number | null;
  km_entrada: number | null;

  combustivel_saida: string | null;
  eletricidade_saida: string | null;

  combustivel_entrada: string | null;
  eletricidade_entrada: string | null;

  entrega_via_any_rent: boolean;

  dua_original_com_motorista: boolean;
  dua_devolvida_em: string | null;
  dua_observacoes: string | null;

  voucher_codigo: string | null;

  cidade_assinatura?: string | null;

  observacoes: string | null;
  observacoes_internas: string | null;

  versao: number;
  contrato_anterior_id: string | null;

  substituido_em: string | null;
  motivo_versao: string | null;

  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContratoRentingInsert = Omit<
  ContratoRenting,
  | 'id'
  | 'org_id'
  | 'codigo'
  | 'total_subtotal'
  | 'total_iva'
  | 'total_final'
  | 'total_calculado'
  | 'facturado_em'
  | 'versao'
  | 'contrato_anterior_id'
  | 'substituido_em'
  | 'motivo_versao'
  | 'km_saida'
  | 'km_entrada'
  | 'combustivel_saida'
  | 'eletricidade_saida'
  | 'combustivel_entrada'
  | 'eletricidade_entrada'
  | 'entrega_via_any_rent'
  | 'dua_original_com_motorista'
  | 'dua_devolvida_em'
  | 'dua_observacoes'
  | 'deleted_at'
  | 'created_by'
  | 'updated_by'
  | 'created_at'
  | 'updated_at'
>;

export type ContratoRentingUpdate = Partial<ContratoRentingInsert> & {
  deleted_at?: string | null;
  gestor_id?: string | null;
};

export type ContratoCondutor = {
  id: string;
  org_id: string;
  contrato_id: string;

  cliente_id: string | null;

  motorista_id: string | null;
  is_principal: boolean;
  created_by: string | null;
  created_at: string;
};

export type ContratoCobertura = {
  id: string;
  org_id: string;
  contrato_id: string;
  cobertura_id: string;
  cobertura_nome: string;
  preco_dia: number;
  franquia_valor: number | null;
  created_by: string | null;
  created_at: string;
};

export type CoberturaFormItem = {
  cobertura_id: string;
  cobertura_nome: string;
  preco_dia: number;
  franquia_valor: number | null;
};

export type ContratoExtra = {
  id: string;
  org_id: string;
  contrato_id: string;
  extra_id: string;
  extra_nome: string;
  preco_unidade: number;
  tipo_calculo: ExtraTipoCalculo;
  quantidade: number;
  total: number;
  created_by: string | null;
  created_at: string;
};

export type ExtraFormItem = {
  extra_id: string;
  extra_nome: string;
  preco_unidade: number;
  tipo_calculo: ExtraTipoCalculo;
  quantidade: number;
};

export type ContratoTaxa = {
  id: string;
  org_id: string;
  contrato_id: string;
  taxa_id: string;
  taxa_nome: string;
  percentagem: number | null;
  valor_fixo: number | null;
  base_calculo: number | null;
  valor_calculado: number;
  created_by: string | null;
  created_at: string;
};

export type TaxaFormItem = {
  taxa_id: string;
  taxa_nome: string;
  percentagem: number | null;
  valor_fixo: number | null;
};

export type ContratoAnexo = {
  id: string;
  org_id: string;
  contrato_id: string;
  nome: string;
  ficheiro_url: string;
  tamanho_bytes: number | null;
  mime_type: string | null;
  descricao: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
