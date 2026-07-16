/** Verifica se um nome de cargo corresponde a um "gestor" (ex.: "Gestor TVDE",
 * "Supervisor Gestor TVDE"). Case-insensitive, tolera dados inconsistentes de
 * capitalização já existentes na tabela `cargos`. */
export function isGestorCargo(cargo: string | null | undefined): boolean {
  return !!cargo && cargo.toLowerCase().includes('gestor');
}

export interface PeriodoExistente {
  id: string;
  dataInicio: string;
  dataFim: string;
  status: 'agendado' | 'ativo' | 'concluido' | 'cancelado';
}

export interface ValidarPeriodoInput {
  dataInicio: string;
  dataFim: string;
  /** Data de hoje em 'YYYY-MM-DD', injectada para testabilidade. */
  hoje: string;
  periodosExistentes: PeriodoExistente[];
}

export interface ValidarPeriodoResult {
  valido: boolean;
  erro?: string;
}

const STATUS_OCUPA_CALENDARIO: PeriodoExistente['status'][] = ['agendado', 'ativo'];

export function validarNovoPeriodo({
  dataInicio,
  dataFim,
  hoje,
  periodosExistentes,
}: ValidarPeriodoInput): ValidarPeriodoResult {
  if (dataFim < dataInicio) {
    return { valido: false, erro: 'Data de fim não pode ser antes da data de início.' };
  }

  if (dataInicio < hoje) {
    return { valido: false, erro: 'Data de início não pode ser no passado.' };
  }

  const sobrepoe = periodosExistentes
    .filter((p) => STATUS_OCUPA_CALENDARIO.includes(p.status))
    .some((p) => dataInicio <= p.dataFim && dataFim >= p.dataInicio);

  if (sobrepoe) {
    return {
      valido: false,
      erro: 'Já existe um período agendado ou ativo que se sobrepõe a estas datas.',
    };
  }

  return { valido: true };
}
