// Fonte única dos ganhos Bolt: bolt_resumos_semanais.liquido_a_pagar, coluna
// GERADA (ganhos_liquidos + campanha/reembolsos quando fonte='api') que
// substituiu o antigo interruptor csv/api — evitava duplicar campanhas e
// dava valores diferentes consoante o ecrã (migrações 20260915170000/180000).
// Nunca somar bolt_viagens: tem uma linha por TENTATIVA de despacho, não por
// corrida (dava 19.489,74 EUR a mais). Gorjetas já vêm incluídas.

/**
 * A tabela e o campo dos ganhos Bolt de um motorista numa semana.
 *
 * Existe para que ninguém tenha de se lembrar do nome, e para que uma busca
 * por este símbolo mostre todos os sítios que leem dinheiro Bolt.
 */
export const BOLT_GANHOS = {
  tabela: 'bolt_resumos_semanais',
  campo: 'liquido_a_pagar',
} as const;
