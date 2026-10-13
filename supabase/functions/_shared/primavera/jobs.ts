// Desfecho de um job da fila Primavera, visto pelo provider que o enfileirou.
// TS puro, sem Deno: testado em jobs.test.ts.

export type EstadoJob = 'pending' | 'claimed' | 'done' | 'failed' | 'ambiguo';

export interface JobLido {
  status: EstadoJob;
  resultado: unknown;
  error_message: string | null;
}

export type Desfecho =
  | { tipo: 'a_correr' }
  | { tipo: 'ok'; resultado: Record<string, unknown> }
  | { tipo: 'falha'; mensagem: string }
  | { tipo: 'ambiguo'; mensagem: string };

export const MENSAGEM_SEM_AGENTE =
  'Primavera (agente local): nenhum agente respondeu a tempo. Verifique se o agente está a ' +
  'correr na rede da empresa (ver instruções em agent/primavera-agent/). Nada foi emitido.';

export const MENSAGEM_AMBIGUO_CLAIMED =
  'Primavera (agente local): o agente reclamou o pedido mas não confirmou o resultado a tempo. ' +
  'Impossível saber se o documento foi criado. Não reemitir sem verificar no Primavera.';

/**
 * Lê o estado de um job. `desistiu` = o provider já esperou o que tinha a
 * esperar. Um pendente depois de desistir só é falha segura se o provider o
 * conseguiu cancelar antes de o agente o reclamar (cancelouPendente); senão o
 * agente pode estar a executá-lo neste momento, e isso é ambíguo.
 */
export function desfechoDoJob(
  job: JobLido | null,
  opcoes: { desistiu: boolean; cancelouPendente?: boolean } = { desistiu: false }
): Desfecho {
  if (!job) {
    return { tipo: 'ambiguo', mensagem: 'Primavera: o pedido desapareceu da fila a meio.' };
  }
  switch (job.status) {
    case 'done':
      return { tipo: 'ok', resultado: (job.resultado ?? {}) as Record<string, unknown> };
    case 'failed':
      return { tipo: 'falha', mensagem: job.error_message || 'Primavera: o agente reportou falha.' };
    case 'ambiguo':
      return { tipo: 'ambiguo', mensagem: job.error_message || MENSAGEM_AMBIGUO_CLAIMED };
    case 'pending':
      if (!opcoes.desistiu) return { tipo: 'a_correr' };
      return opcoes.cancelouPendente
        ? { tipo: 'falha', mensagem: MENSAGEM_SEM_AGENTE }
        : { tipo: 'ambiguo', mensagem: MENSAGEM_AMBIGUO_CLAIMED };
    case 'claimed':
      return opcoes.desistiu
        ? { tipo: 'ambiguo', mensagem: MENSAGEM_AMBIGUO_CLAIMED }
        : { tipo: 'a_correr' };
  }
}
