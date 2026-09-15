// Ganhos Bolt: UMA tabela, UM campo, venha de onde vier.
//
//   bolt_resumos_semanais.liquido_a_pagar
//
// É este o número. Não há segundo sítio, não há interruptor, não há "fonte".
// É uma coluna GERADA pela base (migrações 20260915170000 e 20260915180000):
//
//   ganhos_liquidos
//   + (fonte_viagens = 'api' ? ganhos_campanha + reembolsos_despesas : 0)
//
// A condição não é enfeite. Quando foi o CSV a escrever o líquido (fonte
// 'csv', ou NULL nas linhas do upsert antigo), esse líquido é
// bruto_total − total_taxas e o bruto_total já traz a campanha: somá-la
// outra vez duplicava-a — aconteceu à Bolt Lara durante uma hora.
//
// Porquê não ganhos_liquidos directamente: numa integração ligada à API
// oficial (auth_mode = 'oauth') esse campo é escrito pela API, que devolve
// viagens e não sabe o que é uma campanha. As campanhas só vêm no CSV do
// portal e ficavam em ganhos_campanha, coluna que nenhum ecrã lia — 984,28 EUR
// por pagar numa só semana da Década Ousada (2026-09-07). Somá-las para dentro
// de ganhos_liquidos durava até à sincronização seguinte da API o reescrever;
// a coluna gerada recalcula-se sozinha, venha a escrita de onde vier.
//
// Sem gorjetas: já estão dentro de ganhos_liquidos nos dois lados (verificado
// ao cêntimo em motoristas com gorjeta e sem campanha). O ecrã de contas
// extrai-as e repõe-nas para o ajuste de IVA — está certo, não se mexe.
//
// Quem lê não precisa de saber de onde veio o dinheiro, e é exactamente por
// isso que os três ecrãs mostram o mesmo.
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
  campo: 'liquido_a_pagar',
} as const;
