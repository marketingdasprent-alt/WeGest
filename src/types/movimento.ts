// ============================================================
// Domínio: Movimentações operacionais de viatura
// ============================================================

export const MOVIMENTO_TIPOS = ['transferencia'] as const;

export type MovimentoTipo = (typeof MOVIMENTO_TIPOS)[number];

export const MOVIMENTO_TIPO_LABELS: Record<MovimentoTipo, string> = {
  transferencia: 'Transferência Interna',
};

export const MOVIMENTO_ESTADOS = ['planeado', 'a_decorrer', 'concluido', 'cancelado'] as const;

export type MovimentoEstado = (typeof MOVIMENTO_ESTADOS)[number];

export const MOVIMENTO_ESTADO_LABELS: Record<MovimentoEstado, string> = {
  planeado: 'Planeado',
  a_decorrer: 'A decorrer',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

/** Estados que ocupam a viatura (a contar nos cartões de estatística). */
export const MOVIMENTO_ESTADOS_ATIVOS: readonly MovimentoEstado[] = [
  'planeado',
  'a_decorrer',
] as const;

export type Movimento = {
  id: string;
  org_id: string;
  codigo: number;
  tipo: MovimentoTipo;
  estado: MovimentoEstado;

  viatura_id: string | null;
  matricula: string | null;

  estacao_origem_id: string | null;
  estacao_destino_id: string | null;

  data_partida: string | null;
  data_chegada: string | null;

  colaborador_id: string | null;
  colaborador_nome: string | null;

  km_inicial: number | null;
  km_final: number | null;
  combustivel_inicial: number | null;
  combustivel_final: number | null;

  motivo: string | null;
  prestador: string | null;
  custo_estimado: number | null;
  custo_final: number | null;

  info: string | null;
  observacoes: string | null;
  observacoes_internas: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MovimentoInsert = Omit<
  Movimento,
  'id' | 'org_id' | 'codigo' | 'created_by' | 'created_at' | 'updated_at'
>;

export type MovimentoUpdate = Partial<MovimentoInsert>;

// ============================================================
// Anexos (fotos / documentos)
// ============================================================
export type MovimentoAnexo = {
  id: string;
  org_id: string;
  movimento_id: string;
  nome: string;
  ficheiro_url: string;
  tamanho_bytes: number | null;
  mime_type: string | null;
  descricao: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// ============================================================
// Colaborador interno (utilizador do sistema)
// ============================================================
export type Colaborador = {
  id: string;
  nome: string;
};
