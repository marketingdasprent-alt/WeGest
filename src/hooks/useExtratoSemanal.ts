import { useMemo, useState } from 'react';

import { CONTAS_VALIDAS_DESDE } from '@/components/motorista-portal/dashboardStats';
import { inicioDaSemana, fimDaSemana, paraDataSql } from '@/hooks/useMotoristaExtratoPeriodo';
import { useResumoSemanaFechada } from '@/hooks/useResumoSemanaFechada';

/**
 * A semana do motorista (segunda a domingo) com navegação para trás.
 *
 * Mostra o resumo que a lista de Contas/Resumo gravou ao fechar a semana — o
 * mesmo do escritório. Abre na semana passada: a semana em curso ainda não está
 * fechada e não tem resumo. O Início e a secção Contas usam o mesmo cartão.
 */
export function useExtratoSemanal(motoristaId: string | null | undefined) {
  const [semanasAtras, setSemanasAtras] = useState(1);

  const inicio = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - semanasAtras * 7);
    return inicioDaSemana(d);
  }, [semanasAtras]);
  const fim = useMemo(() => fimDaSemana(inicio), [inicio]);
  // Antes do corte não há contas para mostrar ao motorista.
  const podeAnterior = paraDataSql(inicio) > CONTAS_VALIDAS_DESDE;
  const podeSeguinte = semanasAtras > 1;

  const {
    data: acerto,
    isLoading,
    error,
  } = useResumoSemanaFechada(motoristaId, paraDataSql(inicio));

  return {
    acerto,
    isLoading,
    error,
    inicio,
    fim,
    semanasAtras,
    podeAnterior,
    podeSeguinte,
    anterior: () => setSemanasAtras((n) => (podeAnterior ? n + 1 : n)),
    seguinte: () => setSemanasAtras((n) => Math.max(1, n - 1)),
  };
}
