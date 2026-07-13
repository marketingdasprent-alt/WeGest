/**
 * Entidades auditàveis — mapeamento para tabelas de histórico/auditoria.
 *
 * Cada entidade pode ter zero ou mais tabelas de histórico associadas:
 * - `contrato`   → contratos_edicoes, contratos_reimpressoes, contrato_historico
 * - `lead`       → lead_status_history
 * - `calendario` → calendario_eventos_historico
 * - `reserva`    — sem tabela de histórico dedicada (hard delete)
 * - `motorista`  — sem tabela de histórico dedicada (hard delete)
 */
export type EntidadeAuditavel = 'contrato' | 'reserva' | 'motorista' | 'lead' | 'calendario';

/**
 * Entrada genérica de auditoria, normalizada a partir de qualquer tabela de
 * histórico. Os campos `entidade` e `tabelaOrigem` permitem à UI identificar
 * a proveniência e aplicar rendering específico (ícones, labels, etc.).
 */
export interface AuditEntry {
  id: string;
  /** Entidade de negócio (ex.: 'contrato', 'lead') */
  entidade: EntidadeAuditavel;
  /** Tabela de origem (ex.: 'contratos_edicoes', 'lead_status_history') */
  tabelaOrigem: string;
  /** Descrição curta da acção (ex.: 'edicao', 'reimpressao', 'status → convertido') */
  acao: string;
  /** ID do actor (auth.users) ou null se acção de sistema/legado */
  actorId: string | null;
  /** Detalhe textual opcional */
  detalhe: string | null;
  /** Payload estruturado opcional (ex.: JSONB campos_alterados) */
  payload: Record<string, unknown> | null;
  /** Timestamp ISO da acção */
  createdAt: string;
}

/**
 * Opções para a query de histórico de auditoria.
 */
export interface UseAuditHistoryOptions {
  /** Nº máximo de entradas por tabela (default: 50) */
  limit?: number;
}
