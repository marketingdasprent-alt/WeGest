export interface PrecoContratoTvdeInput {
  regime: string | null | undefined;
  valorTotalManual: number | null | undefined;
  tarifaId: string | null | undefined;
  modeloId: string | null | undefined;
  /** preco_semana da tarifa para o modelo da viatura (renting_tarifa_precos_modelo). */
  precoSemanaModelo: number | null | undefined;
}

// A mesma regra do fecho semanal (edge function) — uma só fonte.
export { precoSemanaNegociadoTvde } from '@shared/precoAluguer';

/**
 * Porque é que um contrato TVDE ficaria sem aluguer a cobrar; `null` quando tem
 * preço. Sem tarifa, sem modelo na viatura ou sem preço para o modelo, o fecho
 * semanal lançava 0 € e a lista mostrava 0,00 € (8 contratos em 2026-10-12).
 */
export function motivoTvdeSemPreco(input: PrecoContratoTvdeInput): string | null {
  if (input.regime !== 'tvde') return null;
  // 0 é um valor acordado válido; só `null` segue a tarifa.
  if (input.valorTotalManual != null) return null;
  if (!input.tarifaId) {
    return 'O contrato não tem tarifa nem valor acordado. Escolhe a tarifa TVDE ou indica o valor acordado.';
  }
  if (!input.modeloId) {
    return 'A viatura não tem modelo definido, por isso a tarifa não tem preço para ela. Define o modelo na ficha da viatura ou indica o valor acordado.';
  }
  if (input.precoSemanaModelo == null) {
    return 'O modelo da viatura não tem preço na tarifa escolhida. Define o preço em Renting → Tarifas ou indica o valor acordado.';
  }
  return null;
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
