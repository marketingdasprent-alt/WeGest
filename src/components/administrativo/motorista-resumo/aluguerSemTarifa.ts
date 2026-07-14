/**
 * Estrutura mínima de uma viatura ativa do motorista com as tarifas do seu
 * grupo — o suficiente para decidir se existe tarifa de aluguer configurada.
 */
export interface ViaturaPeriodoTarifa {
  viaturas: {
    modelo_id?: string | null;
    renting_grupos: {
      renting_tarifas: Array<{ preco_semana: number | null; ativa: boolean }>;
    } | null;
  } | null;
}

/**
 * Devolve `true` quando o motorista tem viatura(s) ativa(s) mas nenhuma tem
 * tarifa de grupo ativa com preço semanal > 0, NEM tarifa TVDE ativa para o
 * seu modelo (`tvdeModeloPrecoMap`, ver renting_tarifa_precos_modelo — TVDE
 * não tem preço por grupo, é por modelo).
 *
 * Distingue "aluguer 0€ por falta de configuração de tarifa" (precisa aviso)
 * de "sem viatura" (0€ legítimo, sem aviso). Alinhado com o cálculo de
 * aluguer em ContasResumoTab.
 */
export function deriveAluguerSemTarifa(
  viaturas: ViaturaPeriodoTarifa[],
  tvdeModeloPrecoMap?: Map<string, number>
): boolean {
  if (viaturas.length === 0) return false;
  const temTarifaAtiva = viaturas.some((mv) => {
    const temTarifaGrupo = (mv.viaturas?.renting_grupos?.renting_tarifas ?? []).some(
      (t) => t.ativa && Number(t.preco_semana ?? 0) > 0
    );
    if (temTarifaGrupo) return true;
    const modeloId = mv.viaturas?.modelo_id;
    return !!modeloId && !!tvdeModeloPrecoMap?.get(modeloId);
  });
  return !temTarifaAtiva;
}
