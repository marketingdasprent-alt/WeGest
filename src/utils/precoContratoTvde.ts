export interface PrecoContratoTvdeInput {
  regime: string | null | undefined;
  valorTotalManual: number | null | undefined;
  tarifaId: string | null | undefined;
  modeloId: string | null | undefined;
  /** preco_semana da tarifa para o modelo da viatura (renting_tarifa_precos_modelo). */
  precoSemanaModelo: number | null | undefined;
}

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
