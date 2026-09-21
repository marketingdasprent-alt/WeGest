import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AuditEntry, EntidadeAuditavel, UseAuditHistoryOptions } from '@/types/audit';

// Algumas tabelas de histórico não constam dos tipos gerados do Supabase.
const db = supabase as unknown as {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string
      ) => {
        order: (
          col: string,
          opts: { ascending: boolean }
        ) => {
          limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
};

interface TableMapping {
  table: string;
  fkColumn: string;
  entidade: string;
  acaoPadrao: string;
  dateColumn: string;
  actorColumn: string;
  detailColumn: string | null;
  payloadColumn: string | null;
  actionColumn: string | null;
}

const TABLES_BY_ENTITY: Record<string, TableMapping[]> = {
  contrato: [
    {
      table: 'contrato_historico',
      fkColumn: 'contrato_id',
      entidade: 'contrato',
      acaoPadrao: 'alteracao',
      dateColumn: 'criado_em',
      actorColumn: 'ator_id',
      detailColumn: 'detalhe',
      payloadColumn: null,
      actionColumn: 'evento_tipo',
    },
    {
      table: 'contratos_edicoes',
      fkColumn: 'contrato_id',
      entidade: 'contrato',
      acaoPadrao: 'edicao',
      dateColumn: 'editado_em',
      actorColumn: 'editado_por',
      detailColumn: 'observacoes',
      payloadColumn: 'campos_alterados',
      actionColumn: null,
    },
    {
      table: 'contratos_reimpressoes',
      fkColumn: 'contrato_id',
      entidade: 'contrato',
      acaoPadrao: 'reimpressao',
      dateColumn: 'reimpresso_em',
      actorColumn: 'reimpresso_por',
      detailColumn: 'motivo',
      payloadColumn: null,
      actionColumn: null,
    },
  ],
  lead: [
    {
      table: 'lead_status_history',
      fkColumn: 'lead_id',
      entidade: 'lead',
      acaoPadrao: 'mudanca_status',
      dateColumn: 'alterado_em',
      actorColumn: 'alterado_por',
      detailColumn: 'observacoes',
      payloadColumn: null,
      actionColumn: null,
    },
  ],
  calendario: [
    {
      table: 'calendario_eventos_historico',
      fkColumn: 'evento_id',
      entidade: 'calendario',
      acaoPadrao: 'alteracao_campo',
      dateColumn: 'editado_em',
      actorColumn: 'editado_por',
      detailColumn: null, // será composto de valor_anterior + valor_novo
      payloadColumn: null,
      actionColumn: 'campo',
    },
  ],
  reserva: [],
  motorista: [],
};

function rowToAuditEntry(row: Record<string, unknown>, mapping: TableMapping): AuditEntry {
  const actorId =
    typeof row[mapping.actorColumn] === 'string' ? (row[mapping.actorColumn] as string) : null;

  let acao = mapping.acaoPadrao;
  if (mapping.actionColumn && typeof row[mapping.actionColumn] === 'string') {
    acao = row[mapping.actionColumn] as string;
  }

  let detalhe: string | null = null;
  if (mapping.table === 'calendario_eventos_historico') {
    const campo = row['campo'] as string | undefined;
    const valorAnterior = row['valor_anterior'] as string | null | undefined;
    const valorNovo = row['valor_novo'] as string | null | undefined;
    if (campo) {
      detalhe = `${campo}: ${valorAnterior ?? '—'} → ${valorNovo ?? '—'}`;
    }
  } else if (mapping.detailColumn && typeof row[mapping.detailColumn] === 'string') {
    detalhe = row[mapping.detailColumn] as string;
  }

  let payload: Record<string, unknown> | null = null;
  if (
    mapping.payloadColumn &&
    row[mapping.payloadColumn] !== null &&
    row[mapping.payloadColumn] !== undefined
  ) {
    const raw = row[mapping.payloadColumn];
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      payload = raw as Record<string, unknown>;
    }
  }

  const createdAt =
    typeof row[mapping.dateColumn] === 'string'
      ? (row[mapping.dateColumn] as string)
      : new Date().toISOString();

  return {
    id: String(row['id'] ?? ''),
    entidade: mapping.entidade as EntidadeAuditavel,
    tabelaOrigem: mapping.table,
    acao,
    actorId,
    detalhe,
    payload,
    createdAt,
  };
}

async function queryTable(
  mapping: TableMapping,
  entityId: string,
  limit: number
): Promise<AuditEntry[]> {
  const { data, error } = await db
    .from(mapping.table)
    .select('*')
    .eq(mapping.fkColumn, entityId)
    .order(mapping.dateColumn, { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!data || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((row) => rowToAuditEntry(row, mapping));
}

interface UseAuditHistoryParams {
  entidade: EntidadeAuditavel;
  id: string;
  options?: UseAuditHistoryOptions;
}

export function useAuditHistory({ entidade, id, options }: UseAuditHistoryParams) {
  const limit = options?.limit ?? 50;
  const mappings = TABLES_BY_ENTITY[entidade] ?? [];

  return useQuery({
    queryKey: ['audit-history', entidade, id, { limit }],
    queryFn: async (): Promise<AuditEntry[]> => {
      if (!id || mappings.length === 0) return [];

      const results = await Promise.all(mappings.map((m) => queryTable(m, id, limit)));

      return results
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
    },
    enabled: !!id && mappings.length > 0,
    staleTime: 15_000,
  });
}
