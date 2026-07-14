/**
 * Estrutura mínima de uma viatura ativa do motorista com as tarifas do seu
 * grupo — o suficiente para decidir se existe tarifa de aluguer configurada.
 */
export interface ViaturaPeriodoTarifa {
  viaturas: {
    renting_grupos: {
      renting_tarifas: Array<{ preco_semana: number | null; ativa: boolean }>;
    } | null;
  } | null;
}

/**
 * Devolve `true` quando o motorista tem viatura(s) ativa(s) mas nenhuma tem
 * tarifa de grupo ativa com preço semanal > 0.
 *
 * Distingue "aluguer 0€ por falta de configuração de tarifa" (precisa aviso)
 * de "sem viatura" (0€ legítimo, sem aviso). Alinhado com o cálculo de
 * aluguer em ContasResumoTab, que só resolve o custo via `renting_tarifas`
 * ativa do grupo da viatura.
 */
export function deriveAluguerSemTarifa(viaturas: ViaturaPeriodoTarifa[]): boolean {
  if (viaturas.length === 0) return false;
  const temTarifaAtiva = viaturas.some((mv) =>
    (mv.viaturas?.renting_grupos?.renting_tarifas ?? []).some(
      (t) => t.ativa && Number(t.preco_semana ?? 0) > 0
    )
  );
  return !temTarifaAtiva;
}
