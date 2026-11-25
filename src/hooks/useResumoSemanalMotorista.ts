import { useContasResumoSemana } from '@/hooks/useContasResumoSemana';
import { usePeriodoFechado } from '@/hooks/usePeriodoFechado';
import type { MotoristaResumo } from '@/components/administrativo/contasResumoExports';

export interface ResumoSemanalMotorista {
  /** null enquanto verifica se a semana já foi fechada. */
  periodoFechado: boolean | null;
  loading: boolean;
  /** A mesma linha que a lista de Contas/Resumo mostra; null = sem valores nesta semana. */
  resumo: MotoristaResumo | null;
}

/** Totais que a ficha mostra, tirados da linha da lista de Contas/Resumo. */
export function totaisDoResumo(resumo: MotoristaResumo | null) {
  if (!resumo) {
    return { faturado: 0, bolt: 0, uber: 0, outras: 0, custos: 0, liquido: 0 };
  }
  const outras = resumo.total_faturado - resumo.faturado_bolt - resumo.faturado_uber;
  const custos =
    resumo.aluguer +
    resumo.combustivel +
    resumo.portagens +
    resumo.reparacoes +
    resumo.outros_custos +
    resumo.slot;
  return {
    faturado: resumo.total_faturado,
    bolt: resumo.faturado_bolt,
    uber: resumo.faturado_uber,
    outras,
    custos,
    liquido: resumo.liquido,
  };
}

/**
 * Resumo de um motorista numa semana, pela MESMA conta da lista de
 * Contas/Resumo (useContasResumoSemana). A ficha não tem conta própria: assim
 * os valores, o documento e o que fica gravado são sempre iguais aos do escritório.
 */
export function useResumoSemanalMotorista(
  motoristaId: string,
  weekStart: Date,
  weekEnd: Date,
  /** Sem acesso ao Financeiro a base esconde a Bolt: não calcular valores incompletos. */
  podeVerFinanceiro: boolean
): ResumoSemanalMotorista {
  const [periodoFechado] = usePeriodoFechado(weekStart, weekEnd);
  // `false` faz a conta não correr (a lista trata-o como "período por fechar").
  const fechadoParaConta = podeVerFinanceiro ? periodoFechado : false;
  const { resumos, loading } = useContasResumoSemana(weekStart, weekEnd, fechadoParaConta, {
    soLeitura: true,
  });
  const resumo = resumos.find((r) => r.motorista_id === motoristaId) ?? null;
  return { periodoFechado, loading: periodoFechado === null || loading, resumo };
}
