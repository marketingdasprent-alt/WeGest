import { ehRegimeTvde, precoSemanaNegociadoTvde, precoSemanalTvde } from '@shared/precoAluguer';

export interface PrecoContratoTvdeInput {
  regime: string | null | undefined;
  /** Preço negociado e aprovado (contrato gravado); o valor manual já não conta. */
  precoSemanaAcordado: number | string | null | undefined;
  tarifaId: string | null | undefined;
  modeloId: string | null | undefined;
  /** preco_semana da tarifa para o modelo da viatura (renting_tarifa_precos_modelo). */
  precoSemanaModelo: number | null | undefined;
  /** preco_semana geral da tarifa (renting_tarifas): o fecho cobra-o antes do do modelo. */
  precoTarifa?: number | null | undefined;
  /**
   * Só na renovação: contratos antigos vivem de um valor manual (listados em
   * scripts/relatorio_tvde_manual_vs_semanal.sql) e não se lhes cria um bloqueio novo.
   */
  valorManualLegado?: number | null | undefined;
}

// A mesma regra do fecho semanal (edge function) — uma só fonte.
export { precoSemanaNegociadoTvde } from '@shared/precoAluguer';

/**
 * Porque é que um contrato TVDE ficaria sem aluguer a cobrar; `null` quando tem
 * preço. Sem tarifa, sem modelo na viatura ou sem preço para o modelo, o fecho
 * semanal lançava 0 € e a lista mostrava 0,00 € (8 contratos em 2026-10-12).
 */
export function motivoTvdeSemPreco(input: PrecoContratoTvdeInput): string | null {
  if (!ehRegimeTvde(input.regime)) return null;
  // Mesma regra do fecho: aprovado, depois tarifa, depois modelo. O manual só
  // conta como legado (renovação).
  const preco = precoSemanalTvde({
    regime: input.regime,
    precoSemanaAcordado: input.precoSemanaAcordado,
    // Os preços da tarifa só contam com tarifa (e o do modelo com modelo).
    precoTarifa: input.tarifaId ? input.precoTarifa : null,
    precoTarifaModelo: input.tarifaId && input.modeloId ? input.precoSemanaModelo : null,
  });
  if (preco.valor != null || input.valorManualLegado != null) return null;
  if (!input.tarifaId) {
    return 'O contrato não tem tarifa. Escolhe uma tarifa TVDE com preço para o modelo ou pede o valor semanal ao supervisor.';
  }
  if (!input.modeloId) {
    return 'A viatura não tem modelo definido, por isso a tarifa não tem preço para ela. Define o modelo na ficha da viatura.';
  }
  if (input.precoSemanaModelo == null) {
    return 'O modelo da viatura não tem preço na tarifa escolhida. Escolhe uma tarifa com preço para o modelo ou define-o em Renting → Tarifas.';
  }
  return null;
}

/**
 * O valor pretendido na abertura difere do da tarifa (em cêntimos, sem ruído
 * de vírgula flutuante): só então há pedido ao supervisor.
 */
export function precoSemanaDifereDaTarifa(
  pretendido: number | null | undefined,
  tarifa: number | null | undefined
): boolean {
  if (pretendido == null || tarifa == null) return false;
  return Math.round(pretendido * 100) !== Math.round(tarifa * 100);
}

interface LinhaPrecoModelo {
  preco_semana?: number | null;
  preco_dia?: number | null;
}

/**
 * A tarifa tem preço para o modelo da viatura (semana no TVDE, dia no resto).
 * A troca de viatura limpa a tarifa que falha isto, e então o seletor solta-se.
 */
export function tarifaCobreModelo(
  regime: string | null | undefined,
  linha: LinhaPrecoModelo | null | undefined
): boolean {
  return regime === 'tvde' ? linha?.preco_semana != null : linha?.preco_dia != null;
}

/** "Negociado 180 € · tabela 200 €" — a tabela só aparece quando difere. */
export function textoPrecoSemanaTvde(
  acordado: number | null | undefined,
  tabela: number | null | undefined
): string {
  if (acordado != null) {
    return tabela != null && tabela !== acordado
      ? `${acordado} € · tabela ${tabela} €`
      : `${acordado} €`;
  }
  return tabela != null ? `${tabela} €` : 'Sem preço';
}
