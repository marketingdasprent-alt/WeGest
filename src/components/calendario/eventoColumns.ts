import type { Database } from '@/integrations/supabase/types';

/**
 * Nomes de colunas de `calendario_eventos` usados nos fluxos de handover
 * (entrega/recolha legacy + renting).
 *
 * Porquê isto existe: as queries de handover usam embeds aninhados
 * (`contratos!inner(...)`) que excedem o limite de inferência do supabase-js
 * (TS2589), obrigando a um cast `as any` no query builder. Esse cast deixaria
 * de validar os nomes das colunas — foi assim que um typo `origen_tipo`
 * (em vez de `origem_tipo`) passou despercebido e partiu as listas.
 *
 * Ao referenciar as colunas através desta constante, o `satisfies` garante
 * validação em compile-time: um nome inexistente falha o type-check mesmo
 * quando o builder está tipado como `any`.
 */
type CalendarioEventoCol = keyof Database['public']['Tables']['calendario_eventos']['Row'];

export const EVENTO_COLS = {
  origemTipo: 'origem_tipo',
  origemId: 'origem_id',
  realizadoEm: 'realizado_em',
} satisfies Record<string, CalendarioEventoCol>;
