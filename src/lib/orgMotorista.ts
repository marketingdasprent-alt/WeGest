/**
 * Para que organização deve o portal do motorista mudar ao abrir.
 *
 * Um motorista pode ter ficha em várias organizações. Se a org desta aba já é
 * uma delas (escolhida no seletor), fica; se não é nenhuma (ex.: staff com dupla
 * função, ou org antiga), muda para a primeira da lista, que vem com as fichas
 * ativas primeiro. `null` = não mudar.
 */
export function orgParaAlinhar(
  orgsDoMotorista: readonly string[],
  orgAtual: string | null | undefined
): string | null {
  if (orgsDoMotorista.length === 0) return null;
  if (orgAtual && orgsDoMotorista.includes(orgAtual)) return null;
  return orgsDoMotorista[0];
}
