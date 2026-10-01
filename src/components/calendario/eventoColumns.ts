import type { Database } from '@/integrations/supabase/types';

/**
 * Colunas de `calendario_eventos` usadas no handover, tipadas via `satisfies`.
 * As queries usam `as any` (embeds excedem o limite de inferência TS2589), o que deixa
 * de validar nomes — foi assim que um typo `origen_tipo` passou despercebido e partiu as listas.
 */
type CalendarioEventoCol = keyof Database['public']['Tables']['calendario_eventos']['Row'];

export const EVENTO_COLS = {
  origemTipo: 'origem_tipo',
  origemId: 'origem_id',
  realizadoEm: 'realizado_em',
} satisfies Record<string, CalendarioEventoCol>;
