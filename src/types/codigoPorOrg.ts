import type { TablesInsert } from '@/integrations/supabase/types';

export type TabelaComCodigoPorOrg = 'contratos_renting' | 'notas_credito' | 'recibos';

export type InsertSemCodigo<T extends TabelaComCodigoPorOrg> = Omit<TablesInsert<T>, 'codigo'>;

export function semCodigo<T extends TabelaComCodigoPorOrg>(
  payload: InsertSemCodigo<T>
): TablesInsert<T> {
  return payload as TablesInsert<T>;
}
