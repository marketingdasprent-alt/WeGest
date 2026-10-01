/**
 * Mesma regra que `public.normalizar_numero_cartao` na BD: só dígitos, últimos
 * 4, com zeros à esquerda. "0000" e vazio dão null.
 *
 * Cada rede grava o cartão de uma forma (Repsol 16 dígitos, EDP com prefixo
 * "PTEDPC", BP sem zeros à esquerda) e `cartoes_frota.numero` tem 2 a 5. Só
 * esta forma bate dos dois lados — o consumo por cartão vem da BD já assim, e
 * o frontend tem de normalizar `numero` pela mesma regra para cruzar.
 */
export function normalizarNumeroCartao(numero: string | null | undefined): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '');
  const ultimos4 = digitos.slice(-4).padStart(4, '0');
  return ultimos4 === '0000' ? null : ultimos4;
}
