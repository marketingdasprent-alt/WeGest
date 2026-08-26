import type { ExtraTipoCalculo } from './rentingExtra';

// ============================================================
// Estado operacional (ciclo do CONTRATO)
// ============================================================
//   agendado ──► em_curso ──► fechado   (tipo_fecho: recolhido | devolvido)
//       │
//       └──────────────────► cancelado  (não chegou a acontecer)
//
// Isto já se chamou "ciclo físico da viatura" e misturava dois vocabulários
// na mesma coluna: 'agendado'/'cancelado' falam do contrato, 'em_curso' e
// 'devolvido' falavam de onde estava o carro. Como só cabe um facto, o da
// viatura ocupava o lugar do do contrato — foi assim que o #577 ficou
// "Devolvido" em vez de fechado, e assim que fechar passou a escrever
// 'cancelado', a única palavra de contrato que sobrava.
//
// "A viatura voltou?" responde-se onde sempre foi registado: o evento de
// recolha com realizado_em preenchido.
//
// 'devolvido' é legado — a migração 20260820150200 esvaziou-o e nada o volta
// a escrever. Fica no union porque o valor continua no enum da BD.
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

// Como o contrato terminou. NÃO é um estado — é registo, escolhido no
// diálogo de fecho. Nunca aparece como filtro nem no formulário do contrato.
export const CONTRATO_TIPOS_FECHO = ['recolhido', 'devolvido'] as const;
export type ContratoTipoFecho = (typeof CONTRATO_TIPOS_FECHO)[number];

export const CONTRATO_TIPO_FECHO_LABELS: Record<ContratoTipoFecho, string> = {
  recolhido: 'Recolhido',
  devolvido: 'Devolvido',
};

// ============================================================
// Estado financeiro (ciclo de facturação)
// ============================================================
export const CONTRATO_ESTADOS_FIN = ['pendente', 'facturado', 'pago', 'anulado'] as const;
export type ContratoEstadoFinanceiro = (typeof CONTRATO_ESTADOS_FIN)[number];

export const CONTRATO_ESTADO_FIN_LABELS: Record<ContratoEstadoFinanceiro, string> = {
  pendente: 'Pendente',
  facturado: 'Facturado',
  pago: 'Pago',
  anulado: 'Anulado',
};

// ============================================================
// Origem
// ============================================================
export const CONTRATO_ORIGENS = ['sistema', 'online', 'telefone', 'balcao'] as const;
export type ContratoOrigem = (typeof CONTRATO_ORIGENS)[number];

export const CONTRATO_ORIGEM_LABELS: Record<ContratoOrigem, string> = {
  sistema: 'Sistema',
  online: 'Online',
  telefone: 'Telefone',
  balcao: 'Balcão',
};

// ============================================================
// Modalidade (rent-a-car vs TVDE — determina a taxa de IVA)
// ============================================================
export const CONTRATO_MODALIDADES = ['rent_a_car', 'tvde'] as const;
export type ContratoModalidade = (typeof CONTRATO_MODALIDADES)[number];

export const CONTRATO_MODALIDADE_LABELS: Record<ContratoModalidade, string> = {
  rent_a_car: 'Rent-a-car',
  tvde: 'TVDE',
};

// ============================================================
// Renovação (ALD — espelha reserva)
// ============================================================
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

// ============================================================
// Regime (rent-a-car vs TVDE)
// ============================================================
// Nota: 'slot' existe no enum partilhado mas NÃO gera contratos_renting
// (a reserva slot fica só como reserva). Mantido aqui por consistência do enum.
export const CONTRATO_REGIMES = ['rent_a_car', 'tvde', 'slot'] as const;
export type ContratoRegime = (typeof CONTRATO_REGIMES)[number];

export const CONTRATO_REGIME_LABELS: Record<ContratoRegime, string> = {
  rent_a_car: 'Rent-a-Car',
  tvde: 'TVDE',
  slot: 'Slot',
};

// ============================================================
// Tipo principal
// ============================================================
export type ContratoRenting = {
  id: string;
  org_id: string;
  codigo: number;

  /** FK obrigatória — todo contrato começa em reserva. */
  reserva_id: string;

  cliente_id: string;

  /** Empresa emissora (clientes.id com tipo_cliente='empresa') — determina
   *  os templates dos documentos gerados. Herdada da reserva na conversão. */
  emissor_id: string | null;

  /** Gestor responsável (profiles.id). Default = quem cria. Base da privacidade
   *  por gestor (só visível ao dono + superiores quando a org a tem ligada). */
  gestor_id: string | null;

  viatura_id: string;
  matricula: string | null;
  grupo: string | null;

  estacao_entrega_id: string | null;
  data_inicio: string;

  estacao_recolha_id: string | null;
  /** NULL em contratos TVDE — sem data de fim, renovação automática. */
  data_fim: string | null;

  estacao_origem_viatura_id: string | null;

  estado_operacional: ContratoEstadoOperacional;
  estado_financeiro: ContratoEstadoFinanceiro;
  origem: ContratoOrigem;
  /** rent_a_car ou tvde — determina o regime e a taxa de IVA (ver org_definicoes). */
  regime: ContratoRegime;

  // Tarifário simples (MVP)
  tarifa_diaria: number | null;
  /** FK para renting_tarifas — usada em TVDE para associar a tarifa por modelo. */
  tarifa_id: string | null;
  desconto_percentagem: number | null;
  /** Taxa de IVA aplicada — derivada da modalidade + config da org. */
  taxa_iva: number;
  valor_total_manual: number | null;

  // Snapshot de totais (NULL até facturar; imutáveis após)
  total_subtotal: number | null;
  total_iva: number | null;
  total_final: number | null;
  facturado_em: string | null;

  /** Total calculado em tempo real (view contrato_renting_totais): tarifa +
   *  coberturas + extras + taxas + IVA. Mergeado no hook de listagem; NÃO é
   *  coluna da tabela. Para contratos facturados coincide com total_final. */
  total_calculado?: number | null;

  // Longa duração / renovação (espelha reserva)
  is_longa_duracao: boolean;
  renovacao_opcao: ContratoRenovacaoOpcao | null;
  renovacao_intervalo_dias: number | null;

  // Financeiro / kms (copiado da reserva, editável no contrato)
  franquia_valor: number | null;
  caucao_valor: number | null;
  kms_incluidos: number | null;
  km_adicional_valor: number | null;

  /** Odómetro no início do mês (rent-a-car longa duração). Registado na
   *  renovação: km_saida = km com que o mês arrancou; km_entrada = km ao
   *  fechar/renovar. O mês seguinte arranca com este km_entrada. */
  km_saida: number | null;
  km_entrada: number | null;
  /** Nível de combustível/bateria na entrega ao motorista (ex.: "3/4", "100%").
   *  Um dos dois fica preenchido consoante o tipo de combustível da viatura. */
  combustivel_saida: string | null;
  eletricidade_saida: string | null;
  /** O mesmo par, na recolha. Existiam na BD e no RPC do QR desde sempre, mas
   *  faltavam aqui — por isso a folha de danos de recolha nunca os conseguiu
   *  mostrar e a metade direita saía vazia. */
  combustivel_entrada: string | null;
  eletricidade_entrada: string | null;

  /** true quando a entrega foi marcada via o atalho "Any Rent" (sem
   *  check-in) — restringe o banner/botão de preenchimento manual de
   *  km/combustível/bateria de saída só a estes contratos. */
  entrega_via_any_rent: boolean;

  /** DUA original — o motorista levou a DUA física da viatura. A flag e a nota
   *  vêm do formulário; `dua_devolvida_em` é escrito só no fecho (quando o
   *  gestor confirma a devolução). Aviso de devolução ativo enquanto
   *  dua_original_com_motorista && !dua_devolvida_em. */
  dua_original_com_motorista: boolean;
  dua_devolvida_em: string | null;
  dua_observacoes: string | null;

  voucher_codigo: string | null;

  /** Cidade de assinatura vigente — gravada por ContratoDocumentosDialog após
   *  a primeira geração de documentos e reaproveitada depois (não pede outra
   *  vez). Opcional: contratos que nunca geraram documentos não têm nenhuma. */
  cidade_assinatura?: string | null;

  observacoes: string | null;
  observacoes_internas: string | null;

  // Versionamento (upgrade/downgrade)
  versao: number;
  contrato_anterior_id: string | null;
  /** NULL = versão actual. NOT NULL = foi substituído nesta data. */
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
  // km_saida/km_entrada, combustivel_saida/eletricidade_saida e
  // entrega_via_any_rent só são escritos server-side pela RPC de renovação
  // (renovar_contrato_renting), pelo fluxo de entrega, ou pelo atalho "Any
  // Rent" — nunca pelo formulário de criar/editar.
  | 'km_saida'
  | 'km_entrada'
  | 'combustivel_saida'
  | 'eletricidade_saida'
  | 'combustivel_entrada'
  | 'eletricidade_entrada'
  | 'entrega_via_any_rent'
  // Os campos DUA são escritos no fluxo de entrega/recolha da viatura
  // (RealizarEntregaPage) e no fecho, nunca no formulário do contrato.
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

// ============================================================
// Condutores (m:n entre contratos_renting e clientes)
// ============================================================
export type ContratoCondutor = {
  id: string;
  org_id: string;
  contrato_id: string;
  /** XOR com motorista_id — exactamente um dos dois preenchido. */
  cliente_id: string | null;
  /** XOR com cliente_id — usado em regime TVDE. */
  motorista_id: string | null;
  is_principal: boolean;
  created_by: string | null;
  created_at: string;
};

// ============================================================
// Coberturas (m:n entre contratos_renting e renting_coberturas)
// ============================================================
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

/** Forma usada no formulário — carrega o snapshot do catálogo. */
export type CoberturaFormItem = {
  cobertura_id: string;
  cobertura_nome: string;
  preco_dia: number;
  franquia_valor: number | null;
};

// ============================================================
// Extras (m:n entre contratos_renting e renting_extras)
// ============================================================
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

/** Forma usada no formulário — carrega o snapshot do catálogo + quantidade. */
export type ExtraFormItem = {
  extra_id: string;
  extra_nome: string;
  preco_unidade: number;
  tipo_calculo: ExtraTipoCalculo;
  quantidade: number;
};

// ============================================================
// Taxas (m:n entre contratos_renting e renting_taxas)
// ============================================================
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

/** Forma usada no formulário — carrega o snapshot do catálogo. */
export type TaxaFormItem = {
  taxa_id: string;
  taxa_nome: string;
  percentagem: number | null;
  valor_fixo: number | null;
};

// ============================================================
// Anexos (1:n por contrato)
// ============================================================
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
