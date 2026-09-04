/**
 * Dias de um período de contrato — a mesma regra que `public.fn_contrato_dias()`
 * usa na base de dados: arredonda para cima, porque se cobra por dia iniciado
 * (1 dia + 1 hora = 2 dias), com o mínimo de 1.
 *
 * Vivia copiado em dois sítios (ResumoContrato e ContratoTabFaturar), os dois
 * com o comentário "espelha fn_contrato_dias()". Ficou aqui antes de nascer o
 * terceiro — o prolongamento precisa exactamente da mesma conta, e nesta app já
 * custou dinheiro ter a mesma fórmula escrita em sítios diferentes.
 *
 * Diferença deliberada face ao SQL: sem datas, ou com um intervalo nulo ou
 * negativo, devolve 0 em vez de 1. Quem chama usa isto para mostrar valores, e
 * "0 dias" lê-se como "ainda não há período"; o SQL, que só corre com um
 * contrato real em mãos, garante o mínimo de 1.
 */
export function contratoDias(inicio?: string | null, fim?: string | null): number {
  if (!inicio || !fim) return 0;
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
}
