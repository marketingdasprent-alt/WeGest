// Fonte financeira dos ganhos Bolt.
//
// Há duas origens possíveis para o MESMO dinheiro:
//   'csv' → bolt_resumos_semanais.ganhos_liquidos (relatório semanal do portal,
//           importado pelo wizard). É o histórico do negócio e a fonte actual.
//   'api' → bolt_viagens.driver_earnings (API oficial Bolt Fleet, por viagem).
//
// Este é o interruptor ÚNICO que decide quem manda no dinheiro Bolt. Nunca se
// somam as duas origens — seriam as mesmas viagens contadas duas vezes, e o
// número que o motorista vê no recibo apareceria a dobrar.
//
// Enquanto estiver em 'csv', a API fica em MODO SOMBRA: bolt_viagens pode
// encher-se à vontade que nenhum ecrã financeiro a consulta. A migração para a
// API faz-se aqui, num sítio só, depois de conferidos os totais das duas
// origens para o mesmo período.
export const BOLT_FONTE_FINANCEIRA: 'csv' | 'api' = 'csv';

/**
 * Receita Bolt de um motorista/período a partir das duas origens.
 * Precedência, nunca soma: com fonte 'api' manda a API e o CSV só entra quando
 * a API não tem nada para o período; com fonte 'csv' manda sempre o CSV.
 */
export function receitaBoltDeduplicada(
  apiTotal: number,
  csvTotal: number,
  fonte: 'csv' | 'api' = BOLT_FONTE_FINANCEIRA
): number {
  if (fonte === 'api' && apiTotal > 0) return apiTotal;
  return csvTotal;
}

/**
 * O registo do CSV (bolt_resumos_semanais) deve entrar no resumo?
 * Só é descartado quando a API é a fonte financeira E já trouxe viagens para
 * esse motorista. Com fonte 'csv' entra sempre — a API não substitui nada.
 */
export function csvBoltEntraNoResumo(
  temDadosApi: boolean,
  fonte: 'csv' | 'api' = BOLT_FONTE_FINANCEIRA
): boolean {
  return !(fonte === 'api' && temDadosApi);
}
