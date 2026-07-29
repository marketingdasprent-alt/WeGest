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
 * Notificação com as colunas do agrupamento.
 *
 * `itens` e `agrupadas` foram acrescentadas à tabela em 20260729200000 e ainda
 * não estão em `src/integrations/supabase/types.ts` — esse ficheiro é gerado e
 * o AGENTS.md §9 proíbe editá-lo à mão. A regeneração corre no workflow
 * `regenerate-types.yml` (em Linux, para garantir UTF-8/LF). Até lá, a
 * composição vive aqui, que é onde o AGENTS.md §9 manda pôr tipos derivados.
 *
 * Quando os tipos forem regenerados, este ficheiro pode passar a
 * `export type Notificacao = Tables<'notificacoes'>` sem mais alterações nos
 * consumidores.
 */
export type Notificacao = Tables<'notificacoes'> & {
  /**
   * Opcional de propósito: enquanto `types.ts` não for regenerado, quem faz
   * `select('*')` recebe as colunas em runtime mas o tipo gerado não as declara.
   * Marcá-las obrigatórias forçaria casts em todos os consumidores sem
   * acrescentar segurança nenhuma. Null nas linhas anteriores à migração; o
   * trigger preenche sempre nas novas.
   */
  itens?: NotificacaoItem[] | null;
  /** Quantos avisos esta linha representa. 1 (ou ausente) = notificação única. */
  agrupadas?: number | null;
};

/** Lista de itens de uma notificação, resiliente a linhas antigas sem `itens`. */
export function itensDaNotificacao(n: Notificacao): NotificacaoItem[] {
  return Array.isArray(n.itens) ? n.itens : [];
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
  return Math.max(1, n.agrupadas ?? 1);
}
