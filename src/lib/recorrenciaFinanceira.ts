/**
 * Lógica pura da recorrência mensal "semana fixa do mês" usada nos lançamentos
 * financeiros recorrentes do motorista. Fonte de verdade do algoritmo de datas;
 * a função SQL `gerar_movimentos_recorrentes` (migração
 * 20260709100000_movimentos_financeiros_recorrentes.sql) traduz fielmente isto.
 *
 * Regra: a âncora (sempre uma segunda-feira) define em que semana do mês
 * (1ª..5ª) a recorrência mensal cai. Todos os meses seguintes, o lançamento
 * sai na segunda-feira que ocupa essa mesma posição. Meses sem essa semana
 * (ex.: âncora na 5ª semana e o mês só tem 4 segundas-feiras) não geram nada.
 */
import { startOfMonth, addDays, getDay } from 'date-fns';

/** Semana do mês (1..5) em que a data cai, pelo dia-do-mês / 7 arredondado para cima. */
export function semanaDoMes(data: Date): number {
  return Math.ceil(data.getDate() / 7);
}

/** Primeira segunda-feira do mês que contém `data`. */
export function primeiraSegundaDoMes(data: Date): Date {
  const primeiroDia = startOfMonth(data);
  const diaSemana = getDay(primeiroDia) || 7; // 1=Seg..7=Dom (domingo=0 -> 7)
  const offset = (8 - diaSemana) % 7;
  return addDays(primeiroDia, offset);
}

/** Segunda-feira do mês de `data` que ocupa a mesma "semana do mês" que `ancora`. Null se esse mês não tiver essa semana. */
export function segundaEquivalente(ancora: Date, data: Date): Date | null {
  const semana = semanaDoMes(ancora);
  const alvo = addDays(primeiraSegundaDoMes(data), (semana - 1) * 7);
  return alvo.getMonth() === data.getMonth() ? alvo : null;
}

const ORDINAIS = ['1ª', '2ª', '3ª', '4ª', '5ª'];

/** Texto legível: "sempre na 2ª semana de cada mês". */
export function descreverSemanaDoMes(ancora: Date): string {
  const n = semanaDoMes(ancora);
  return `sempre na ${ORDINAIS[n - 1] ?? `${n}ª`} semana de cada mês`;
}
