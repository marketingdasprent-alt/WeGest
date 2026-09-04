// supabase/functions/_shared/resumo-semanal-viatura/calc.ts
/**
 * Cálculo puro do resumo financeiro semanal de UMA viatura.
 *
 * Receita = valor do contrato ativo (TVDE ou rent-a-car) rateado pelos dias
 * da semana em que o contrato esteve em vigor — sem extras/coberturas/taxas.
 * Despesa = multas + custo de reparações (danos), sem combustível/portagens/
 * ganhos de plataforma (essas deixaram de contar para o financeiro da
 * viatura — só o que está no contrato e o que ela custa em multas/oficina).
 */
import { agregarMovimentos } from '../resumo/movimentosMotorista.ts';

export interface ContratoSemanaInput {
  regime: 'tvde' | 'rent_a_car';
  dataInicio: string; // 'YYYY-MM-DD'
  dataFim: string | null;
  /** Tarifa semanal resolvida (grupo, fallback por modelo) — só usada se regime='tvde'. */
  valorSemanalTvde: number;
  /** Tarifa diária do contrato — só usada se regime='rent_a_car' sem override. */
  tarifaDiariaRentACar: number;
  /** Override manual do total do contrato — se definido, rateado pelos dias totais do contrato. */
  valorTotalManualRentACar: number | null;
  /** Dias totais do contrato (data_inicio → data_fim), usado só para ratear o override manual. */
  diasTotaisContrato: number;
}

export interface CalcResumoSemanalInput {
  /** Início do período a fechar — não precisa ser segunda-feira nem alinhar a uma semana civil. */
  semanaInicio: string; // 'YYYY-MM-DD'
  /** Fim do período a fechar (inclusive) — pode ser qualquer data >= semanaInicio. */
  semanaFim: string; // 'YYYY-MM-DD'
  /** null = sem contrato ativo a cobrir este período. */
  contrato: ContratoSemanaInput | null;
  totalMultas: number;
  totalDanos: number;
}

export interface ResumoSemanalViatura {
  receitaAluguer: number;
  despesaMultas: number;
  despesaDanos: number;
}

function diffDiasInclusive(inicio: Date, fim: Date): number {
  return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1;
}

/** Dias numa semana civil — denominador fixo da tarifa TVDE, independente do
 * tamanho do período a fechar (ver comentário abaixo). */
const DIAS_SEMANA = 7;

export function calcResumoSemanalViatura(input: CalcResumoSemanalInput): ResumoSemanalViatura {
  const weekStart = new Date(`${input.semanaInicio}T00:00:00Z`);
  const weekEnd = new Date(`${input.semanaFim}T00:00:00Z`);

  let receitaContrato = 0;
  const c = input.contrato;
  if (c) {
    const cInicio = new Date(`${c.dataInicio}T00:00:00Z`);
    const cFim = c.dataFim ? new Date(`${c.dataFim}T00:00:00Z`) : weekEnd;
    const overlapInicio = cInicio > weekStart ? cInicio : weekStart;
    const overlapFim = cFim < weekEnd ? cFim : weekEnd;

    if (overlapInicio <= overlapFim) {
      const dias = diffDiasInclusive(overlapInicio, overlapFim);
      // TVDE: a tarifa é semanal, por isso o dia-equivalente é sempre
      // valorSemanalTvde/7 — NÃO dividir pelo tamanho do período a fechar.
      // Fechar só 3 dias (ex: segunda-quarta) tem de dar 3/7 da tarifa
      // semanal, não a tarifa inteira dividida por 3.
      const taxaDiaria =
        c.regime === 'tvde'
          ? c.valorSemanalTvde / DIAS_SEMANA
          : c.valorTotalManualRentACar != null
            ? c.valorTotalManualRentACar / Math.max(1, c.diasTotaisContrato)
            : c.tarifaDiariaRentACar;
      receitaContrato = dias * taxaDiaria;
    }
  }

  return {
    receitaAluguer: receitaContrato,
    despesaMultas: input.totalMultas,
    despesaDanos: input.totalDanos,
  };
}

export interface CondutorSemana {
  motoristaId: string | null;
  clienteId: string | null;
}

export interface MotoristaFinanceiroWeekRow {
  tipo: 'credito' | 'debito';
  categoria: string | null;
  valor: number;
}

export interface WeeklyContractSummaryInput {
  semanaInicio: string;
  semanaFim: string;
  contrato: ContratoSemanaInput;
  condutor: CondutorSemana;
  motoristaFinanceiro: MotoristaFinanceiroWeekRow[];
  boltUber: { bolt: number; uber: number };
  totalMultas: number;
  totalDanos: number;
}

export interface ResumoSemanalMotorista {
  custoAluguer: number;
  receitaBolt: number;
  receitaUber: number;
  receitaOutras: number;
  despesaCaucao: number;
  despesaSeguros: number;
  despesaOutros: number;
}

export interface WeeklyContractSummary {
  receitaViatura: ResumoSemanalViatura;
  custoMotorista: ResumoSemanalMotorista | null;
}

export function buildWeeklyContractSummary(
  input: WeeklyContractSummaryInput
): WeeklyContractSummary {
  const receitaViatura = calcResumoSemanalViatura({
    semanaInicio: input.semanaInicio,
    semanaFim: input.semanaFim,
    contrato: input.contrato.regime === 'tvde'
      ? input.contrato
      : {
          regime: 'rent_a_car',
          dataInicio: input.contrato.dataInicio,
          dataFim: input.contrato.dataFim,
          valorSemanalTvde: 0,
          tarifaDiariaRentACar: input.contrato.tarifaDiariaRentACar,
          valorTotalManualRentACar: input.contrato.valorTotalManualRentACar,
          diasTotaisContrato: input.contrato.diasTotaisContrato,
        },
    totalMultas: input.totalMultas,
    totalDanos: input.totalDanos,
  });

  if (!input.condutor.motoristaId) {
    return { receitaViatura, custoMotorista: null };
  }

  let receitaOutras = 0;
  let despesaCaucao = 0;
  let despesaSeguros = 0;
  let despesaOutros = 0;
  // A mesma função que o resumo do motorista e a lista de Contas/Resumo
  // usam. Estava aqui escrita à mão, e divergia das outras duas — ver
  // ../resumo/movimentosMotorista.ts.
  {
    const mov = agregarMovimentos(input.motoristaFinanceiro);
    receitaOutras += mov.receitaOutras;
    despesaCaucao += mov.caucao;
    despesaSeguros += mov.seguros;
    despesaOutros += mov.outros;
  }

  return {
    receitaViatura,
    custoMotorista: {
      custoAluguer: receitaViatura.receitaAluguer,
      receitaBolt: input.boltUber.bolt,
      receitaUber: input.boltUber.uber,
      receitaOutras,
      despesaCaucao,
      despesaSeguros,
      despesaOutros,
    },
  };
}
