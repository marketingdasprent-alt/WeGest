import type { MatcherMotoristas } from '../bolt-import-csv/parse.ts';

export interface ContaBolt {
  telefone?: string | null;
  email?: string | null;
}

/**
 * Ficha a que pertence uma conta Bolt, pelo telefone ou pelo email da conta;
 * nunca pelo nome. "Fabio Silva" cabia no Fabio Xavier da Silva Gomes Queirós
 * e no Fabio Amaro da Silva, e a Bolt de um foi parar às contas do outro.
 * Telefone e email a apontar para fichas diferentes: não se adivinha.
 */
export function fichaDaContaPorContacto(
  conta: ContaBolt,
  matcher: MatcherMotoristas
): string | null {
  const porTelefone = conta.telefone ? matcher.encontrar(null, conta.telefone, null) : null;
  const porEmail = conta.email ? matcher.encontrar(null, null, conta.email) : null;
  if (porTelefone && porEmail && porTelefone !== porEmail) return null;
  return porTelefone ?? porEmail;
}

/**
 * Se o ID Bolt da conta pode ficar gravado nesta ficha. Só quando o contacto
 * da conta é dela: gravado, passa a decidir de quem é a conta para sempre.
 * A 2026-10-19 o CSV da PREMIUM RIDE gravou "Jorge Silva" (Jorge Campos) na
 * ficha do Paulo Jorge Amado da Silva, a única activa com "Jorge" e "Silva".
 */
export function podeGravarIdNaFicha(
  conta: ContaBolt,
  fichaId: string,
  matcher: MatcherMotoristas
): boolean {
  return fichaDaContaPorContacto(conta, matcher) === fichaId;
}
