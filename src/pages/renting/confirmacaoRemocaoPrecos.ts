// Tem de bater com o HINT de salvar_precos_modelo_tarifa (20260925100000).
const HINT_CONFIRMAR_REMOCAO_PRECOS = 'confirmar_remocao_precos';

/**
 * A função recusou gravar porque a tarifa ia perder o preço de um modelo que um
 * contrato aberto usa — a mensagem do erro já lista esses contratos.
 */
export function pedeConfirmacaoRemocaoPrecos(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { hint?: unknown }).hint === HINT_CONFIRMAR_REMOCAO_PRECOS
  );
}
