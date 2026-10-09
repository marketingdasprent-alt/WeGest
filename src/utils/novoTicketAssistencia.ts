/** Parâmetro com que a lista de viaturas abre o ticket já com o carro escolhido
 *  (o mesmo nome que a nova reserva usa). */
export const PARAMETRO_VIATURA = 'viatura_id';

export const rotaNovoTicketDaViatura = (viaturaId: string): string =>
  `/assistencia/nova?${PARAMETRO_VIATURA}=${encodeURIComponent(viaturaId)}`;

/** A viatura pedida no endereço, se for uma das que se podem escolher. */
export function viaturaPedida<T extends { id: string }>(
  params: URLSearchParams,
  viaturas: readonly T[]
): T | null {
  const id = params.get(PARAMETRO_VIATURA);
  if (!id) return null;
  return viaturas.find((v) => v.id === id) ?? null;
}
