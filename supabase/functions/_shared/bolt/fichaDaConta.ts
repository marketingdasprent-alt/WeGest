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
