import { useMemo, useState } from 'react';

import {
  useMotoristaExtratoPeriodo,
  inicioDaSemana,
  fimDaSemana,
} from '@/hooks/useMotoristaExtratoPeriodo';

/**
 * Extrato de uma semana (segunda a domingo) com navegação para trás.
 *
 * Abre na semana actual e recua com as setas do cartão; a função no servidor
 * recebe início e fim, por isso isto é só contar semanas. Vive aqui porque
 * o Início e a secção Contas mostram o mesmo cartão — um só sítio a contar.
 */
export function useExtratoSemanal(motoristaId: string | null | undefined) {
  const [semanasAtras, setSemanasAtras] = useState(0);

  const inicio = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - semanasAtras * 7);
    return inicioDaSemana(d);
  }, [semanasAtras]);
  const fim = useMemo(() => fimDaSemana(inicio), [inicio]);

  const {
    data: extrato,
    isLoading,
    error,
  } = useMotoristaExtratoPeriodo(motoristaId ?? undefined, inicio, fim);

  return {
    extrato,
    isLoading,
    error,
    inicio,
    fim,
    semanasAtras,
    anterior: () => setSemanasAtras((n) => n + 1),
    seguinte: () => setSemanasAtras((n) => Math.max(0, n - 1)),
  };
}
