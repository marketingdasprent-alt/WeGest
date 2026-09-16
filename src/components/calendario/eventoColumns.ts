import type { Database } from '@/integrations/supabase/types';

/** `satisfies` valida colunas apesar do cast exigido pelos embeds do Supabase. */
type CalendarioEventoCol = keyof Database['public']['Tables']['calendario_eventos']['Row'];

export const EVENTO_COLS = {
  origemTipo: 'origem_tipo',
  origemId: 'origem_id',
  realizadoEm: 'realizado_em',
} satisfies Record<string, CalendarioEventoCol>;
