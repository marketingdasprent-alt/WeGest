/**
 * Rótulos partilhados entre a vista de tabela e a vista de fluxo.
 *
 * O `event_type` não é humanizado de propósito. Traduzir mecanicamente
 * (`_` → espaço + maiúscula inicial) dava "Iuc a pagar" e "Licenca tvde
 * expirando" — os acrónimos e os acentos não existem na coluna. O nome legível
 * já vive em `automation_rules.nome` ("IUC da viatura a pagar"); o event_type
 * fica como identificador técnico, que é o que também é.
 */

const MODULOS: Record<string, string> = {
  assistencia_ticket: 'Assistência',
  cobranca: 'Financeiro',
  contrato_renting: 'Renting',
  invoice: 'Financeiro',
  motorista: 'Motoristas',
  seguranca: 'Segurança',
  utilizador: 'Utilizadores',
  viatura: 'Viaturas',
};

/**
 * Módulo do produto a que o evento pertence, a partir do prefixo.
 *
 * `cobranca` e `invoice` colapsam em "Financeiro": são fases da mesma coisa
 * (cobrança gerada → fatura emitida) e separá-las dava dois filtros que o
 * utilizador tem de escolher entre si sem saber a diferença.
 */
export function moduloDoEvento(eventType: string): string {
  const prefixo = eventType.split('.')[0];
  return MODULOS[prefixo] ?? 'Outros';
}

/** Valor do filtro que significa "não filtrar". */
export const TODOS_OS_MODULOS = 'todos';
