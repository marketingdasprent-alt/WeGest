/**
 * Critério único de "viatura atual" de um motorista (`motorista_viaturas`).
 *
 * Nenhum dos dois campos chega sozinho: os triggers `fn_contrato_sincroniza_
 * atribuicao` e `fn_motorista_viaturas_fecha_anteriores` escrevem `data_fim` e
 * não mexem no `status`, pelo que há linhas com `status='ativo'` e uma
 * `data_fim` — umas já passadas (a associação acabou), outras no futuro (é o
 * fim do contrato, o carro ainda está com o motorista). Olhar só ao status
 * mostrava carros já devolvidos; exigir `data_fim IS NULL` escondia carros
 * que estão mesmo atribuídos.
 */

export interface AssociacaoViatura {
  status?: string | null;
  data_fim?: string | null;
}

/** Hoje em 'YYYY-MM-DD', no fuso local — a `data_fim` é uma `date`, não um instante. */
export function hojeISO(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function associacaoViaturaAtiva(
  assoc: AssociacaoViatura,
  hoje: string = hojeISO()
): boolean {
  if ((assoc.status ?? '').trim().toLowerCase() !== 'ativo') return false;
  if (!assoc.data_fim) return true;
  return assoc.data_fim.split('T')[0] >= hoje;
}

/** O mesmo critério em `.or()` do PostgREST, para filtrar no servidor.
 *  Usa-se depois de `.eq('status', 'ativo')`. */
export function filtroDataFimViva(hoje: string = hojeISO()): string {
  return `data_fim.is.null,data_fim.gte.${hoje}`;
}
