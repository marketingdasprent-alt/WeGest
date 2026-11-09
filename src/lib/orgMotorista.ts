export interface OrgFichaMotorista {
  orgId: string;
  fichaAtiva: boolean;
}

/**
 * Para que organização deve o portal do motorista mudar ao abrir.
 *
 * Só a ficha ativa conta na app: se o motorista tem ficha ativa nalguma
 * empresa, o portal abre aí, mesmo que a aba estivesse na de uma ficha inativa.
 * Sem nenhuma ativa, fica na que já está (o painel mostra que está inativa).
 * `null` = não mudar.
 */
export function orgParaAlinhar(
  orgsDoMotorista: readonly OrgFichaMotorista[],
  orgAtual: string | null | undefined
): string | null {
  if (orgsDoMotorista.length === 0) return null;
  const ativas = orgsDoMotorista.filter((o) => o.fichaAtiva);
  const candidatas = ativas.length > 0 ? ativas : orgsDoMotorista;
  if (orgAtual && candidatas.some((o) => o.orgId === orgAtual)) return null;
  return candidatas[0].orgId;
}
