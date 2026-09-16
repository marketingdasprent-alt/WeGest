import { differenceInDays, parseISO, max, min, format, addDays } from 'date-fns';
import type { SlotPeriodo } from '../MotoristaResumoDialog';

export interface ViaturaPeriodoInput {
  viatura_id: string;
  data_inicio: string;
  data_fim: string | null;
  preco_semana?: number | null;
  viaturas: {
    matricula: string;
    modelo_id: string | null;
    renting_grupos: {
      renting_tarifas: Array<{ preco_semana: number | null; ativa: boolean }>;
    } | null;
  } | null;
}

interface CandidatoDoDia {
  viaturaId: string;
  matricula: string;
  taxaDiaria: number;
  inicio: string;
}

function venceODia(candidato: CandidatoDoDia, actual: CandidatoDoDia): boolean {
  if (candidato.viaturaId === actual.viaturaId) return false;
  if (candidato.inicio !== actual.inicio) return candidato.inicio > actual.inicio;
  return candidato.viaturaId < actual.viaturaId;
}

export function buildSlotPeriodos(
  viaturasPeriodoData: ViaturaPeriodoInput[],
  weekStart: Date,
  weekEnd: Date,
  tvdeModeloPrecoMap: Map<string, number>
): SlotPeriodo[] {
  const totalWeekDays = differenceInDays(weekEnd, weekStart) + 1;

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

  return Array.from(porViatura.values())
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
    .sort((a, b) => (a._ordena < b._ordena ? -1 : a._ordena > b._ordena ? 1 : 0))
    .map(({ _ordena: _descartado, ...periodo }) => periodo);
}
