/**
 * Motoristas com algum custo positivo na semana. Entram nas contas mesmo sem
 * faturação — senão quem só pagou o aluguer da viatura desaparecia com o negativo.
 */
export function motoristasComCustos(custosPorMotorista: Array<Record<string, number>>): string[] {
  const ids = new Set<string>();
  for (const mapa of custosPorMotorista) {
    for (const [motoristaId, valor] of Object.entries(mapa)) {
      if (valor > 0) ids.add(motoristaId);
    }
  }
  return [...ids];
}
