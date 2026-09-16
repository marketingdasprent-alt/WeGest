import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  movimentoSelect,
  mergeMovimentosToRows,
  type MovimentoRaw,
  type FaturacaoRow,
} from '@/components/administrativo/faturacao';
import type { InvoiceMetadata } from '@/types/faturacao';

export interface ContaCorrenteCliente {
  linhas: FaturacaoRow[];
  invoiceByCobranca: Map<string, InvoiceMetadata>;
  faturado: number;
  recebido: number;
  saldo: number;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const ORIGENS_RECEBIDO = new Set(['recibo', 'nota_credito']);

function calcularTotais(
  raw: MovimentoRaw[]
): Pick<ContaCorrenteCliente, 'faturado' | 'recebido' | 'saldo'> {
  let faturado = 0;
  let recebido = 0;
  for (const m of raw) {
    const v = Number(m.valor) || 0;
    const signed = m.tipo === 'debito' ? v : -v;
    if (ORIGENS_RECEBIDO.has(m.origem)) {
      recebido += -signed; // crédito soma; débito (estorno) subtrai
    } else {
      faturado += signed; // débito soma; crédito (estorno de cobrança) subtrai
    }
  }
  faturado = round2(faturado);
  recebido = round2(recebido);
  return { faturado, recebido, saldo: round2(faturado - recebido) };
}

async function fetchContaCorrente(clienteId: string): Promise<ContaCorrenteCliente> {
  const sel = movimentoSelect();
  const { data, error } = await supabase
    .from('conta_movimentos')
    .select(sel)
    .eq('entidade_id', clienteId)
    .order('data_movimento', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  const raw = (data ?? []) as unknown as MovimentoRaw[];
  const linhas = mergeMovimentosToRows(raw, {}, {});
  const totais = calcularTotais(raw);

  const cobrancaIds = Array.from(
    new Set(
      raw
        .flatMap((m) => [m.cobranca_id, m.recibo?.referencia ?? null])
        .filter((x): x is string => !!x)
    )
  );

  const invoiceByCobranca = new Map<string, InvoiceMetadata>();
  if (cobrancaIds.length > 0) {
    const { data: invs } = await supabase
      .from('invoices')
      .select('*')
      .in('cobranca_id', cobrancaIds)
      .eq('status', 'emitida');
    for (const inv of (invs ?? []) as unknown as InvoiceMetadata[]) {
      if (!inv.cobranca_id) continue;
      if (inv.tipo !== 'FT' && inv.tipo !== 'FR') continue;
      const prev = invoiceByCobranca.get(inv.cobranca_id);
      if (!prev || (inv.created_at ?? '') > (prev.created_at ?? '')) {
        invoiceByCobranca.set(inv.cobranca_id, inv);
      }
    }
  }

  return { linhas, invoiceByCobranca, ...totais };
}

export function useContaCorrenteCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ['conta-corrente-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: () => fetchContaCorrente(clienteId as string),
  });
}
