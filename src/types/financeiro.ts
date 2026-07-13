// ============================================================
// Tipos partilhados do módulo financeiro (faturação, recibos, notas de crédito)
// Prepara unificação Task 20 — tipos agnósticos ao componente que os consome.
// ============================================================

import type { DocTipo } from '@/components/administrativo/faturacao';
import type { InvoiceMetadata } from './faturacao';

/** Tipo de documento financeiro — alinhado com DocTipo em faturacao.ts. */
export type TipoDocumentoFinanceiro = DocTipo;

/** Entrada financeira genérica (extrato consolidado). */
export interface FinanceiroEntry {
  id: string;
  tipo: TipoDocumentoFinanceiro;
  valor: number;
  credito: number | null;
  debito: number | null;
  descricao: string;
  data: string | null;
  createdAt: string;
  contratoId: string | null;
  contratoLabel: string;
  clienteNome: string;
  documentoNumero: string;
  metodoPagamento: string;
  estacaoNome: string;
  utilizador: string;
  invoice: InvoiceMetadata | null;
}

/** Resumo de KPIs financeiros (valor + contagem + período). */
export interface ResumoFinanceiro {
  valor: number;
  count: number;
  dateLabel: string;
}

/** Filtros partilhados entre views financeiras. */
export interface FiltrosFinanceiros {
  dataInicio: string | null;
  dataFim: string | null;
  estacaoId: string | null;
  metodo: string | null;
}

/** Configuração de exportação. */
export interface ExportConfig {
  formato: 'xlsx' | 'print';
  limite: number;
}
