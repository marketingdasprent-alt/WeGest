// A 02/11 a sincronização da Bolt Açores falhou com BOOT_ERROR (a função não
// arrancou) e a semana ficou por sincronizar até alguém dar por isso.
// Falhas da infra voltam à fila; erros da Bolt ou dos dados não.

export const MAX_TENTATIVAS = 3;

const CODIGOS_PASSAGEIROS = ['BOOT_ERROR', 'WORKER_LIMIT', 'WORKER_ERROR', 'EARLY_DROP'];

/** A resposta de bolt-sync-semana é uma falha da plataforma, que se repete sem mudar nada. */
export function falhaPassageira(httpStatus: number | null, dados: unknown): boolean {
  const codigo =
    dados && typeof dados === 'object' ? (dados as Record<string, unknown>).code : undefined;
  if (typeof codigo === 'string' && CODIGOS_PASSAGEIROS.includes(codigo)) return true;
  // null = o pedido nem chegou a ter resposta (rede).
  return httpStatus === null || httpStatus >= 500;
}

/** Volta à fila se ainda tem tentativas; a contagem inclui a que acabou de falhar. */
export function voltaATentar(tentativasFeitas: number | null | undefined): boolean {
  return (tentativasFeitas ?? 0) + 1 < MAX_TENTATIVAS;
}
