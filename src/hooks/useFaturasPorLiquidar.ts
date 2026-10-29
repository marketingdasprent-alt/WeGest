import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CobrancaParaRecibo } from '@/lib/recibos';
import type { InvoiceMetadata } from '@/types/faturacao';

export interface FaturaPorLiquidar extends CobrancaParaRecibo {
  valorTotal: number;
  pago: number;
  creditado: number;
  emitidaEm: string | null;
}

export interface ClienteComFaturas {
  clienteId: string;
  clienteNome: string;
  faturas: FaturaPorLiquidar[];
  totalPendente: number;
}

export interface CobrancaEmitidaRow {
  id: string;
  descricao: string | null;
  valor_total: number | null;
  emitida_em: string | null;
  destinatario_id: string;
  destinatario_nome: string;
  contrato_id: string | null;
  documento_externo_ref: string | null;
}

export interface FiltroPorLiquidar {
  /** yyyy-MM-dd, inclusivo; vazio = sem limite */
  de: string;
  ate: string;
  /** Só estas cobranças — para reler o saldo mesmo antes de fazer recibos. */
  ids?: string[];
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** Saldo = total − recibos ativos − notas de crédito ativas; o `estado` sozinho não chega (ver useContasAReceber). */
export function montarFaturasPorLiquidar(
  cobrancas: CobrancaEmitidaRow[],
  pagoPorCobranca: Map<string, number>,
  creditadoPorCobranca: Map<string, number>
): FaturaPorLiquidar[] {
  return cobrancas
    .map((c) => {
      const valorTotal = Number(c.valor_total) || 0;
      const pago = pagoPorCobranca.get(c.id) ?? 0;
      const creditado = creditadoPorCobranca.get(c.id) ?? 0;
      return {
        id: c.id,
        descricao: c.descricao,
        destinatario_id: c.destinatario_id,
        destinatario_nome: c.destinatario_nome.trim(),
        contrato_id: c.contrato_id,
        documento_externo_ref: c.documento_externo_ref,
        emitidaEm: c.emitida_em,
        valorTotal,
        pago,
        creditado,
        saldoPagar: round2(valorTotal - pago - creditado),
      };
    })
    .filter((f) => f.saldoPagar > 0.005);
}

/** Como o mapa do KeyInvoice: por cliente (A→Z), faturas da mais antiga para a mais recente. */
export function agruparPorCliente(faturas: FaturaPorLiquidar[]): ClienteComFaturas[] {
  const grupos = new Map<string, ClienteComFaturas>();
  for (const f of faturas) {
    const g = grupos.get(f.destinatario_id) ?? {
      clienteId: f.destinatario_id,
      clienteNome: f.destinatario_nome,
      faturas: [],
      totalPendente: 0,
    };
    g.faturas.push(f);
    g.totalPendente = round2(g.totalPendente + f.saldoPagar);
    grupos.set(f.destinatario_id, g);
  }
  const lista = [...grupos.values()];
  lista.forEach((g) =>
    g.faturas.sort((a, b) => (a.emitidaEm ?? '').localeCompare(b.emitidaEm ?? ''))
  );
  return lista.sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt'));
}

function somarPorChave<T>(rows: T[], chave: (r: T) => string | null, valor: (r: T) => number) {
  const mapa = new Map<string, number>();
  rows.forEach((r) => {
    const k = chave(r);
    if (k) mapa.set(k, (mapa.get(k) ?? 0) + valor(r));
  });
  return mapa;
}

// Os ids vão na URL do pedido; em lotes para não passar o limite de tamanho.
const LOTE_IDS = 150;
function emLotes<T>(lista: T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += LOTE_IDS) lotes.push(lista.slice(i, i + LOTE_IDS));
  return lotes;
}

function diaSeguinte(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function carregarFaturasPorLiquidar(
  filtro: FiltroPorLiquidar
): Promise<FaturaPorLiquidar[]> {
  let q = supabase
    .from('contrato_cobrancas')
    .select(
      'id, descricao, valor_total, emitida_em, destinatario_id, destinatario_nome, contrato_id, documento_externo_ref'
    )
    .eq('estado', 'emitida');
  if (filtro.de) q = q.gte('emitida_em', filtro.de);
  if (filtro.ate) q = q.lt('emitida_em', diaSeguinte(filtro.ate));
  if (filtro.ids) q = q.in('id', filtro.ids);
  const { data: cobrancas, error } = await q;
  if (error) throw error;
  if (!cobrancas?.length) return [];

  const recibos: { referencia: string | null; valor: number }[] = [];
  const notas: { cobranca_id: string; valor: number }[] = [];
  for (const ids of emLotes(cobrancas.map((c) => c.id))) {
    const [rec, nc] = await Promise.all([
      supabase
        .from('recibos')
        .select('referencia, valor')
        .in('referencia', ids)
        .eq('estado', 'ativo'),
      supabase
        .from('notas_credito')
        .select('cobranca_id, valor')
        .in('cobranca_id', ids)
        .eq('estado', 'ativo'),
    ]);
    if (rec.error) throw rec.error;
    if (nc.error) throw nc.error;
    recibos.push(...(rec.data ?? []));
    notas.push(...(nc.data ?? []));
  }

  return montarFaturasPorLiquidar(
    cobrancas,
    somarPorChave(
      recibos,
      (r) => r.referencia,
      (r) => Number(r.valor)
    ),
    somarPorChave(
      notas,
      (n) => n.cobranca_id,
      (n) => Number(n.valor)
    )
  );
}

/** O documento fiscal (FT/FR) de uma cobrança, para abrir o PDF; null se não tiver. */
export async function carregarFaturaDaCobranca(
  cobrancaId: string
): Promise<InvoiceMetadata | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('cobranca_id', cobrancaId)
    .in('tipo', ['FT', 'FR'])
    .eq('status', 'emitida')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as InvoiceMetadata | null) ?? null;
}

export function useFaturasPorLiquidar(filtro: FiltroPorLiquidar) {
  return useQuery({
    queryKey: ['faturas-por-liquidar', filtro],
    queryFn: () => carregarFaturasPorLiquidar(filtro),
  });
}
