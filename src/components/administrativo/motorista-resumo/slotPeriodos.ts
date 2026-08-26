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

/** Quem fica com o dia quando duas viaturas o disputam. */
interface CandidatoDoDia {
  viaturaId: string;
  matricula: string;
  taxaDiaria: number;
  /** `data_inicio` da atribuição, por extenso — desempata sobreposições. */
  inicio: string;
}

/**
 * Entre duas atribuições que cobrem o mesmo dia, manda a que COMEÇOU MAIS
 * TARDE: é o modelo de "entregou o carro A e levou o B", e é a única leitura
 * que sobrevive quando a `data_fim` da anterior ficou por fechar.
 * Empate a `data_inicio` desempata pelo `viatura_id`, para o resultado não
 * depender da ordem por que as linhas vieram da base de dados — o padrão
 * "último a ler ganha" já custou dinheiro três vezes neste projecto.
 */
function venceODia(candidato: CandidatoDoDia, actual: CandidatoDoDia): boolean {
  if (candidato.viaturaId === actual.viaturaId) return false;
  if (candidato.inicio !== actual.inicio) return candidato.inicio > actual.inicio;
  return candidato.viaturaId < actual.viaturaId;
}

/**
 * Constrói os períodos de aluguer de viatura da semana, um por VEÍCULO —
 * nunca um por linha de atribuição (`motorista_viaturas`).
 *
 * REGRA CENTRAL: **cada dia do período é cobrado uma única vez**, ao motorista,
 * qualquer que seja o número de viaturas que o reclamem. A soma de `dias` de
 * todas as linhas devolvidas nunca excede os dias do período.
 *
 * Antes desta regra os dias eram unidos por VIATURA e nunca somados por
 * pessoa: duas viaturas com atribuições sobrepostas davam 7 + 7 dias numa
 * semana de 7. Caso real gravado no fecho de 10–16/08/2026 — um motorista com
 * BN-07-BO 500,00 € + BI-81-IR 275,00 € + BQ-28-AQ 275,00 € = 1.050,00 € numa
 * semana, com os sete dias totalmente sobrepostos nos três contratos.
 *
 * Duas linhas sobrepostas para o MESMO veículo (ex.: uma atribuição fechada
 * com `data_fim` tarde demais + a nova já aberta antes disso — bug de dados
 * real, motorista #582/Rui Teixeira: "encerrado" 15/07–10/08 e "ativo"
 * 02/08–∞ para a mesma AT-36-XD, sobrepostos 8 dias) continuam a contar a
 * UNIÃO dos dias. Uma troca a meio da semana para um veículo DIFERENTE
 * continua a gerar duas linhas, com os dias repartidos entre elas.
 */
export function buildSlotPeriodos(
  viaturasPeriodoData: ViaturaPeriodoInput[],
  weekStart: Date,
  weekEnd: Date,
  tvdeModeloPrecoMap: Map<string, number>
): SlotPeriodo[] {
  const totalWeekDays = differenceInDays(weekEnd, weekStart) + 1;

  // dia (yyyy-MM-dd) → a viatura que o cobra. Um dia, um dono.
  const donoDoDia = new Map<string, CandidatoDoDia>();

  viaturasPeriodoData.forEach((mv) => {
    const tarifas = mv.viaturas?.renting_grupos?.renting_tarifas || [];
    const tarifa = tarifas.find((t) => t.ativa);
    const modeloId = mv.viaturas?.modelo_id;
    const valorSemanal =
      Number(mv.preco_semana ?? 0) ||
      Number(tarifa?.preco_semana ?? 0) ||
      (modeloId ? (tvdeModeloPrecoMap.get(modeloId) ?? 0) : 0);
    if (!valorSemanal) return;

    // O dia em que o motorista LEVANTA o carro não é cobrado a ninguém: a
    // contagem começa no dia seguinte. Numa troca a meio da semana, a semana
    // fecha em 6 dias e não em 7 — é intencional, o dia da troca é dele.
    const primeiroDiaCobravel = addDays(parseISO(mv.data_inicio), 1);
    const periodStart = max([primeiroDiaCobravel, weekStart]);
    const periodEnd = mv.data_fim ? min([parseISO(mv.data_fim), weekEnd]) : weekEnd;
    if (periodStart > periodEnd) return;

    const candidato: CandidatoDoDia = {
      viaturaId: mv.viatura_id,
      matricula: mv.viaturas?.matricula ?? '—',
      taxaDiaria: valorSemanal / totalWeekDays,
      inicio: mv.data_inicio,
    };

    for (let d = periodStart; d <= periodEnd; d = addDays(d, 1)) {
      const chave = format(d, 'yyyy-MM-dd');
      const actual = donoDoDia.get(chave);
      if (!actual || venceODia(candidato, actual)) donoDoDia.set(chave, candidato);
    }
  });

  const porViatura = new Map<string, { matricula: string; taxaDiaria: number; dias: string[] }>();
  for (const [dia, dono] of donoDoDia) {
    const entry = porViatura.get(dono.viaturaId) ?? {
      matricula: dono.matricula,
      taxaDiaria: dono.taxaDiaria,
      dias: [],
    };
    entry.dias.push(dia);
    porViatura.set(dono.viaturaId, entry);
  }

  return (
    Array.from(porViatura.values())
      .map((entry) => {
        const datasOrdenadas = entry.dias.slice().sort();
        const dias = datasOrdenadas.length;
        return {
          matricula: entry.matricula,
          dias,
          taxaDiaria: entry.taxaDiaria,
          custo: dias * entry.taxaDiaria,
          dataInicioStr: format(parseISO(datasOrdenadas[0]), 'dd/MM'),
          dataFimStr: format(parseISO(datasOrdenadas[datasOrdenadas.length - 1]), 'dd/MM'),
          _ordena: datasOrdenadas[0],
        };
      })
      // Ordem cronológica e estável: quem começou primeiro aparece primeiro.
      .sort((a, b) => (a._ordena < b._ordena ? -1 : a._ordena > b._ordena ? 1 : 0))
      .map(({ _ordena: _descartado, ...periodo }) => periodo)
  );
}
