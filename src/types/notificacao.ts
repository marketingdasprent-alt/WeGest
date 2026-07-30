import type { Tables } from '@/integrations/supabase/types';

/**
 * Uma entidade afectada por uma notificação agrupada.
 *
 * O agrupamento in-app (migração 20260729200000) colapsa os avisos do mesmo
 * tipo/dia/destinatário numa única linha e guarda aqui a lista de tudo o que
 * foi afectado — é o que garante que agrupar não perde nenhum link. Todos os
 * campos são opcionais porque a origem faz `jsonb_strip_nulls`: um aviso de
 * motorista não tem `viatura_id`, um de viatura não tem `candidatura_id`.
 */
export interface NotificacaoItem {
  link?: string;
  viatura_id?: string;
  candidatura_id?: string;
  evento_id?: string;
  mensagem?: string;
  /** Timestamp ISO de quando este aviso individual foi gerado. */
  em?: string;
}

/**
 * Notificação como a BD a devolve.
 *
 * `itens` e `agrupadas` entraram na tabela em 20260729200000 e já estão nos
 * tipos gerados, por isso esta composição deixou de precisar de as declarar.
 * `itens` chega como `Json` — a forma concreta é `NotificacaoItem[]`, garantida
 * pelo trigger que a escreve, e a leitura passa sempre por
 * `itensDaNotificacao` para que a asserção viva num sítio só.
 */
export type Notificacao = Tables<'notificacoes'>;

/** Lista de itens de uma notificação, resiliente a linhas antigas sem `itens`. */
export function itensDaNotificacao(n: Notificacao): NotificacaoItem[] {
  return Array.isArray(n.itens) ? (n.itens as NotificacaoItem[]) : [];
}

/**
 * Quantos avisos a notificação representa.
 *
 * Prefere o comprimento de `itens` à coluna `agrupadas` quando ambos existem:
 * `itens` é a lista que o utilizador consegue efectivamente abrir, e é essa que
 * o número no ecrã tem de descrever. Divergirem significaria mostrar "(88)" e
 * abrir 3 — pior do que mostrar "(3)".
 */
export function totalAgrupado(n: Notificacao): number {
  const itens = itensDaNotificacao(n);
  if (itens.length > 0) return itens.length;
  // O `??` fica apesar de o tipo gerado dar `agrupadas` como sempre presente:
  // payloads de realtime, selects parciais e linhas anteriores à migração
  // 20260729200000 chegam cá sem a coluna, e sem isto o total sairia NaN.
  return Math.max(1, n.agrupadas ?? 1);
}
