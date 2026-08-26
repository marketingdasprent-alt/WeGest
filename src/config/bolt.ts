// Ganhos Bolt: UMA tabela, UM campo, venha de onde vier.
//
//   bolt_resumos_semanais.ganhos_liquidos
//
// É este o número. Não há segundo sítio, não há interruptor, não há "fonte".
// Tanto a API oficial como o CSV do portal escrevem NESTE campo — a RPC
// bolt_resumo_merge_api e a bolt_resumo_merge_csv, desde a migração
// 20260813210000. Quem lê não precisa de saber de onde veio o dinheiro, e é
// exactamente por isso que os três ecrãs passam a mostrar o mesmo.
//
// ─────────────────────────────────────────────────────────────────────────
// O QUE ISTO SUBSTITUIU, E PORQUÊ
//
// Havia aqui um `BOLT_FONTE_FINANCEIRA: 'csv' | 'api'` que escolhia entre
// DUAS TABELAS para o mesmo dinheiro:
//
//   'csv' → bolt_resumos_semanais.ganhos_liquidos
//   'api' → bolt_viagens.driver_earnings
//
// Isso obrigava cada ecrã a repetir a decisão, e bastava um deles decidir
// diferente para o mesmo motorista aparecer com dois valores. O interruptor
// deixou de fazer sentido no dia em que `ganhos_liquidos` passou a ser escrito
// pelos dois caminhos: passou a haver uma resposta só.
//
// Um detalhe que não pode voltar: `bolt_viagens` NÃO serve para dinheiro. É a
// tabela das viagens à unidade, com uma linha por TENTATIVA de despacho — a
// mesma corrida aparece lá tantas vezes quantas a Bolt a despachou, sempre com
// os mesmos valores. Somá-la dava 19.489,74 EUR a mais (ver a desduplicação em
// _shared/bolt/agregar.ts). Quem agrega bolt_viagens é o bolt-sync-semana, e o
// resultado vai para bolt_resumos_semanais — que é o que se lê.
// ─────────────────────────────────────────────────────────────────────────

/**
 * A tabela e o campo dos ganhos Bolt de um motorista numa semana.
 *
 * Existe para que ninguém tenha de se lembrar do nome, e para que uma busca
 * por este símbolo mostre todos os sítios que leem dinheiro Bolt.
 */
export const BOLT_GANHOS = {
  tabela: 'bolt_resumos_semanais',
  campo: 'ganhos_liquidos',
} as const;
