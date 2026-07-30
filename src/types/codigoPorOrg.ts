import type { TablesInsert } from '@/integrations/supabase/types';

/**
 * Tabelas cujo `codigo` é atribuído por um trigger `BEFORE INSERT`
 * (`set_<tabela>_codigo_por_org`): a sequência é por organização, não global.
 */
export type TabelaComCodigoPorOrg = 'contratos_renting' | 'notas_credito' | 'recibos';

/**
 * Payload de insert para uma tabela com código por org — tudo menos `codigo`.
 */
export type InsertSemCodigo<T extends TabelaComCodigoPorOrg> = Omit<TablesInsert<T>, 'codigo'>;

/**
 * Prepara um payload de insert para tabelas com código por org.
 *
 * `supabase gen types` não consegue ver triggers, por isso gera `codigo: number`
 * como obrigatório nestas três tabelas. Só que quem insere não tem como saber o
 * próximo número da organização — e mandá-lo seria pior do que inútil: o trigger
 * desiste quando o recebe preenchido (`IF NEW.codigo IS NOT NULL THEN RETURN NEW`),
 * o que abriria a porta a códigos duplicados.
 *
 * A asserção fica aqui, num sítio só, em vez de espalhada por casts nos call
 * sites. Todos os outros campos continuam verificados pelo tipo gerado.
 */
export function semCodigo<T extends TabelaComCodigoPorOrg>(
  payload: InsertSemCodigo<T>
): TablesInsert<T> {
  return payload as TablesInsert<T>;
}
