// O cron corta o pedido aos 120 s. A 03/11 as integrações eram chamadas uma
// a uma e à espera da Cartrack sem limite, e o job caiu por timeout.
// Agora correm em paralelo e cada uma tem prazo próprio, abaixo dos 120 s.

export const PRAZO_POR_INTEGRACAO_MS = 90_000;

export interface Integracao {
  id: string;
  nome: string | null;
}

export interface ResultadoIntegracao {
  integracao_id: string;
  nome: string | null;
  ok: boolean;
  vehicles: number | null;
  error: string | null;
}

/** Chama a sync de cada integração ao mesmo tempo; uma lenta ou falhada não trava as outras. */
export function sincronizarTodas(
  alvo: readonly Integracao[],
  chamar: (integracaoId: string, sinal: AbortSignal) => Promise<Response>,
  prazoMs: number = PRAZO_POR_INTEGRACAO_MS
): Promise<ResultadoIntegracao[]> {
  return Promise.all(
    alvo.map(async (intg): Promise<ResultadoIntegracao> => {
      try {
        const resp = await chamar(intg.id, AbortSignal.timeout(prazoMs));
        const body = await resp.json().catch(() => ({}));
        return {
          integracao_id: intg.id,
          nome: intg.nome,
          ok: resp.ok && body?.success === true,
          vehicles: body?.vehicles?.upserted ?? null,
          error: body?.success ? null : (body?.error ?? `HTTP ${resp.status}`),
        };
      } catch (e) {
        const timeout = e instanceof DOMException && e.name === 'TimeoutError';
        return {
          integracao_id: intg.id,
          nome: intg.nome,
          ok: false,
          vehicles: null,
          error: timeout
            ? `Sem resposta em ${Math.round(prazoMs / 1000)} s`
            : e instanceof Error
              ? e.message
              : String(e),
        };
      }
    })
  );
}
