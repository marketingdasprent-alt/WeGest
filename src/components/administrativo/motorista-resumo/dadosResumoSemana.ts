import type { ContratoParaPeriodo } from './periodosDoContrato';
import type { TarifaModeloRow } from './tvdeModeloPreco';

/** Linhas de que a conta do resumo semanal precisa. Vêm da lista toda da org
 *  (Contas/Resumo) ou só de um motorista (ficha) — a conta é a mesma. */
export interface DadosResumoSemana {
  motoristas: MotoristaParaResumo[];
  uberResumos: UberResumoRow[];
  atividadeUber: Array<{ uber_driver_id: string | null; viagens_concluidas: number | null }>;
  uberDrivers: UberDriverRow[];
  /** BP, Repsol e EDP juntos. */
  combustivel: TransacaoMotoristaRow[];
  portagens: TransacaoMotoristaRow[];
  contratos: ContratoComCondutores[];
  tarifas: Array<{ id: string; grupo_id: string | null; preco_semana: number | null }>;
  tarifasModelo: TarifaModeloRow[];
  financeiro: MovimentoFinanceiroRow[];
  boltResumos: BoltResumoRow[];
}

export interface MotoristaParaResumo {
  id: string;
  nome: string;
  recibo_verde: boolean | null;
  retencao_irs: boolean | null;
  retencao_iva_pct: number | null;
  retencao_irs_pct: number | null;
  corte_sem_recibo_pct: number | null;
  uber_uuid: string | null;
  bolt_id: string | null;
  gestor_responsavel: string | null;
  data_contratacao: string | null;
  status_ativo: boolean | null;
  desativado_em: string | null;
  created_at: string;
  is_conta_frota: boolean | null;
}

export interface UberResumoRow {
  uber_driver_id: string | null;
  motorista_nome: string | null;
  motorista_id: string | null;
  ganhos_brutos: number | null;
  gorjetas: number | null;
  viagens: number | null;
}

export interface UberDriverRow {
  uber_driver_id: string;
  motorista_id: string | null;
  full_name: string | null;
  is_conta_frota: boolean | null;
}

export interface TransacaoMotoristaRow {
  motorista_id: string | null;
  amount: number | null;
}

export interface MovimentoFinanceiroRow {
  motorista_id: string | null;
  valor: number | null;
  categoria: string | null;
  tipo: string | null;
}

export interface BoltResumoRow {
  motorista_id: string | null;
  motorista_nome: string | null;
  liquido_a_pagar: number | null;
  gorjetas: number | null;
  viagens_terminadas: number | null;
  identificador_motorista: string | null;
  integracao_id?: string | null;
}

export type ContratoComCondutores = ContratoParaPeriodo & {
  contrato_condutores?:
    | Array<{ motorista_id: string | null }>
    | { motorista_id: string | null }
    | null;
};
