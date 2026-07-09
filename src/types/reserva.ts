export const RESERVA_ESTADOS = [
  'pendente',
  'confirmada',
  'em_curso',
  'concluida',
  'cancelada',
  'expirada',
] as const;

export type ReservaEstado = (typeof RESERVA_ESTADOS)[number];

// Estados que ocupam slot na timeline e bloqueiam novas reservas
export const RESERVA_ESTADOS_ACTIVOS: readonly ReservaEstado[] = [
  'pendente',
  'confirmada',
  'em_curso',
] as const;

export const ESTADO_LABELS: Record<ReservaEstado, string> = {
  pendente: 'Pendente',
  confirmada: 'Confirmada',
  em_curso: 'Em Contrato',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
};

/** Estados que o gestor pode escolher manualmente no regime SLOT.
 *  'cancelada' é apresentado como "Fechada". */
export const SLOT_ESTADOS_PERMITIDOS = [
  'pendente',
  'em_curso',
  'concluida',
  'cancelada',
] as const satisfies readonly ReservaEstado[];

export const SLOT_ESTADO_LABELS: Record<(typeof SLOT_ESTADOS_PERMITIDOS)[number], string> = {
  pendente: 'Pendente',
  em_curso: 'Em Contrato',
  concluida: 'Concluída',
  cancelada: 'Fechada',
};

export const RENOVACAO_OPCOES = [
  'primeiro_dia_mes',
  'mesmo_dia_cada_mes',
  'intervalo_dias',
] as const;
export type RenovacaoOpcao = (typeof RENOVACAO_OPCOES)[number];

export const RENOVACAO_OPCAO_LABELS: Record<RenovacaoOpcao, string> = {
  primeiro_dia_mes: 'Ao primeiro dia de cada mês',
  mesmo_dia_cada_mes: 'No mesmo dia em cada mês',
  intervalo_dias: 'A cada intervalo específico de dias',
};

export const RESERVA_REGIMES = ['rent_a_car', 'tvde', 'slot'] as const;
export type ReservaRegime = (typeof RESERVA_REGIMES)[number];

export const REGIME_LABELS: Record<ReservaRegime, string> = {
  rent_a_car: 'Rent-a-Car',
  tvde: 'TVDE',
  slot: 'Slot',
};

export type Reserva = {
  id: string;
  org_id: string;
  codigo: number;
  viatura_id: string | null;
  matricula: string | null;
  grupo: string | null;
  estacao_entrega_id: string | null;
  estacao_recolha_id: string | null;
  data_inicio: string;
  data_fim: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  condutor_id: string | null;
  condutor_nome: string | null;
  /** Empresa emissora (clientes.id com tipo_cliente='empresa') — determina
   *  os templates dos documentos gerados. Obrigatória a partir de confirmada. */
  emissor_id: string | null;
  /** Gestor responsável (profiles.id). Default = quem cria. Base da privacidade
   *  por gestor (só visível ao dono + superiores quando a org a tem ligada). */
  gestor_id: string | null;
  estado: ReservaEstado;
  /** rent_a_car, tvde ou slot — determina o regime de aluguer e a taxa de IVA. */
  regime: ReservaRegime;
  /** Valor semanal cobrado ao motorista no regime slot (por carro). */
  slot_valor_semanal: number | null;
  /** Valor mensal BRUTO (IVA incl.) cobrado ao motorista no regime slot. */
  slot_valor_mensal: number | null;
  valor_total: number | null;
  /** FK para renting_tarifas — usada em TVDE para associar a tarifa por modelo. */
  tarifa_id: string | null;
  observacoes: string | null;
  observacoes_internas: string | null;
  // Longa duração / renovação
  is_longa_duracao: boolean;
  renovacao_opcao: RenovacaoOpcao | null;
  renovacao_intervalo_dias: number | null;
  // Financeiro / kms
  franquia_valor: number | null;
  caucao_valor: number | null;
  kms_incluidos: number | null;
  km_adicional_valor: number | null;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// org_id é preenchido por trigger na BD — fica de fora do payload do formulário.
export type ReservaInsert = Omit<
  Reserva,
  | 'id'
  | 'codigo'
  | 'org_id'
  | 'deleted_at'
  | 'created_by'
  | 'updated_by'
  | 'created_at'
  | 'updated_at'
  // gestor_id é preenchido por DEFAULT na BD (= quem cria); reatribuível via Update.
  | 'gestor_id'
>;

export type ReservaUpdate = Partial<ReservaInsert> & {
  deleted_at?: string | null;
  gestor_id?: string | null;
};

// ============================================================
// Condutores (m:n entre reservas e clientes)
// ============================================================
export type ReservaCondutor = {
  id: string;
  org_id: string;
  reserva_id: string;
  /** XOR com motorista_id — exactamente um dos dois preenchido. */
  cliente_id: string | null;
  /** XOR com cliente_id — usado em regime TVDE. */
  motorista_id: string | null;
  is_principal: boolean;
  created_by: string | null;
  created_at: string;
};

/** Forma usada no formulário antes da reserva ter ID na BD.
 *  Exactamente um dos dois (cliente_id/motorista_id) preenchido. */
export type CondutorFormItem = {
  cliente_id: string | null;
  motorista_id: string | null;
  is_principal: boolean;
};

// ============================================================
// Anexos
// ============================================================
export type ReservaAnexo = {
  id: string;
  org_id: string;
  reserva_id: string;
  nome: string;
  ficheiro_url: string;
  tamanho_bytes: number | null;
  mime_type: string | null;
  descricao: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
