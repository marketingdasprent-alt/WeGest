/**
 * Conta-corrente de UM cliente (entidade).
 *
 * A conta-corrente é o livro-razão `conta_movimentos` (append-only), alimentado
 * por triggers a partir de cobranças (débito), recibos (crédito), notas de
 * crédito (crédito) e respetivos estornos. NÃO é a tabela `invoices` — essa é só
 * o espelho fiscal (para obter o PDF do documento no provider/KeyInvoice).
 *
 * Este hook é, na prática, a `FaturacaoTab` do Administrativo filtrada por
 * `entidade_id`: reutiliza `movimentoSelect` + `mergeMovimentosToRows` (que já
 * consolidam a Fatura-Recibo numa única linha e derivam débito/crédito por tipo)
 * e junta o mapa cobrança→documento fiscal para o download do PDF.
 *
 * `entidade_id` cobre tanto o titular como o condutor (ambos são registos em
 * `clientes`), por isso é a chave correta — melhor do que filtrar por
 * `contratos_renting.cliente_id`, que só apanharia o titular.
 */
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
  /** Linhas já consolidadas e ordenadas por data desc. */
  linhas: FaturacaoRow[];
  /** Documento fiscal (FT/FR) por cobrança — para descarregar o PDF. */
  invoiceByCobranca: Map<string, InvoiceMetadata>;
  /** Total faturado: Σ débitos de cobrança − Σ estornos de cobrança anulada. */
  faturado: number;
  /** Total recebido/creditado: Σ créditos de recibos e notas de crédito ativos. */
  recebido: number;
  /** Saldo por receber = faturado − recebido. Positivo = o cliente ainda deve. */
  saldo: number;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Totais a partir dos movimentos crus (antes da consolidação de linhas).
 *
 * Trabalhamos sobre os movimentos brutos — e não sobre as linhas consolidadas —
 * porque o saldo tem de somar TODOS os débitos e créditos individualmente
 * (a Fatura-Recibo, por ex., é 1 linha mas 2 movimentos que se anulam no saldo).
 *
 * Convenção (coerente com conta_corrente_saldo = Σdébito − Σcrédito, onde
 * positivo = o cliente deve). Cada movimento vai para o lado da sua ORIGEM,
 * em valor LÍQUIDO (o movimento e o seu estorno cancelam-se dentro do mesmo
 * cartão):
 *
 *   faturado (o que o cliente deve) = origens de dívida: cobrança, dano, ajuste
 *              → débito soma, crédito (estorno de cobrança anulada) subtrai.
 *   recebido (o que abateu a dívida) = origens de pagamento: recibo, nota_credito
 *              → crédito soma, débito (estorno de recibo/NC anulado) subtrai.
 *   saldo = faturado − recebido = Σ débitos − Σ créditos → por receber.
 *
 * Agrupar por origem (e não só pelo lado débito/crédito) garante que o estorno
 * de uma cobrança anulada abate o FATURADO (em vez de inflar o RECEBIDO) e que
 * um dano a débito entra no FATURADO (em vez de tornar o RECEBIDO negativo).
 * A identidade do saldo mantém-se em qualquer caso.
 */
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
  // 1) Movimentos da conta-corrente desta entidade (mesmos embeds da FaturacaoTab).
  const sel = movimentoSelect();
  const { data, error } = await supabase
    .from('conta_movimentos')
    .select(sel)
    .eq('entidade_id', clienteId)
    .order('data_movimento', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  const raw = (data ?? []) as unknown as MovimentoRaw[];
  // estacoesMap/profilesMap não são precisos nesta vista (colunas omitidas).
  const linhas = mergeMovimentosToRows(raw, {}, {});
  const totais = calcularTotais(raw);

  // 2) Documentos fiscais (FT/FR emitidos) das cobranças visíveis — p/ o PDF.
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
      // Só faturas (FT/FR) têm PDF a mostrar por cobrança; NC/RC não substituem.
      if (inv.tipo !== 'FT' && inv.tipo !== 'FR') continue;
      const prev = invoiceByCobranca.get(inv.cobranca_id);
      // fica com o documento mais recente da cobrança
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
