import { differenceInDays, parseISO, max, min, format, addDays } from 'date-fns';
import type { SlotPeriodo } from '../MotoristaResumoDialog';

export interface ViaturaPeriodoInput {
  viatura_id: string;
  data_inicio: string;
  data_fim: string | null;
  /** Preço semanal já resolvido pelo chamador. Tem prioridade sobre a tarifa
   *  do grupo/modelo abaixo — para quem já traz os preços em mapas próprios
   *  (ContasResumoTab) não ter de replicar a query encadeada do diálogo. */
  preco_semana?: number | null;
  viaturas: {
    matricula: string;
    modelo_id: string | null;
    renting_grupos: {
      renting_tarifas: Array<{ preco_semana: number | null; ativa: boolean }>;
    } | null;
  } | null;
}

/**
 * Constrói os períodos de aluguer de viatura da semana, um por VEÍCULO —
 * nunca um por linha de atribuição (`motorista_viaturas`). Duas linhas
 * sobrepostas para o MESMO veículo (ex.: uma atribuição fechada com
 * `data_fim` tarde demais + a nova já aberta antes disso — bug de dados
 * real, encontrado no motorista #582/Rui Teixeira: "encerrado" 15/07–10/08
 * e "ativo" 02/08–∞ para a mesma AT-36-XD, sobrepostos 8 dias) contam a
 * UNIÃO dos dias cobertos, nunca a soma de cada linha — senão o mesmo dia
 * é cobrado duas vezes. Uma troca a meio da semana para um veículo
 * DIFERENTE continua a gerar duas linhas (matrículas diferentes),
 * correctamente — o agrupamento é por `viatura_id`, não colapsa tudo.
 */
export function buildSlotPeriodos(
  viaturasPeriodoData: ViaturaPeriodoInput[],
  weekStart: Date,
  weekEnd: Date,
  tvdeModeloPrecoMap: Map<string, number>
): SlotPeriodo[] {
  const totalWeekDays = differenceInDays(weekEnd, weekStart) + 1;
  const porViatura = new Map<
    string,
    { matricula: string; taxaDiaria: number; dias: Set<string> }
  >();

  viaturasPeriodoData.forEach((mv) => {
    const tarifas = mv.viaturas?.renting_grupos?.renting_tarifas || [];
    const tarifa = tarifas.find((t) => t.ativa);
    const modeloId = mv.viaturas?.modelo_id;
    const valorSemanal =
      Number(mv.preco_semana ?? 0) ||
      Number(tarifa?.preco_semana ?? 0) ||
      (modeloId ? (tvdeModeloPrecoMap.get(modeloId) ?? 0) : 0);
    if (!valorSemanal) return;

    const periodStart = max([parseISO(mv.data_inicio), weekStart]);
    const periodEnd = mv.data_fim ? min([parseISO(mv.data_fim), weekEnd]) : weekEnd;
    if (periodStart > periodEnd) return;

    const entry = porViatura.get(mv.viatura_id) ?? {
      matricula: mv.viaturas?.matricula ?? '—',
      taxaDiaria: valorSemanal / totalWeekDays,
      dias: new Set<string>(),
    };
    for (let d = periodStart; d <= periodEnd; d = addDays(d, 1)) {
      entry.dias.add(format(d, 'yyyy-MM-dd'));
    }
    porViatura.set(mv.viatura_id, entry);
  });

  return Array.from(porViatura.values()).map((entry) => {
    const datasOrdenadas = Array.from(entry.dias).sort();
    const dias = datasOrdenadas.length;
    return {
      matricula: entry.matricula,
      dias,
      taxaDiaria: entry.taxaDiaria,
      custo: dias * entry.taxaDiaria,
      dataInicioStr: format(parseISO(datasOrdenadas[0]), 'dd/MM'),
      dataFimStr: format(parseISO(datasOrdenadas[datasOrdenadas.length - 1]), 'dd/MM'),
    };
  });
}
