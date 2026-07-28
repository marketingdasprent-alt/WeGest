import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { registarPagamentoParcela, type RegistarPagamentoInput } from '@/lib/acordoPagamento';
import type { ParcelaEstado } from '@/components/faturacao/ParcelaStatusBadge';

const QUERY_KEY_BASE = ['acordo-detalhe'] as const;

export interface ParcelaDetalhe {
  id: string;
  numero: number;
  dataVencimento: string;
  valor: number;
  estado: ParcelaEstado;
  avisoEnviadoEm: string | null;
  invoiceRcId: string | null;
  /** liquidacao_pendente + a linha de faturacao_outbox correspondente está 'suspenso'. */
  suspenso: boolean;
}

export interface AcordoDetalhe {
  id: string;
  codigo: number;
  estado: 'ativo' | 'liquidado' | 'incumprimento' | 'cancelado';
  valorTotal: number;
  faltaPagar: number;
  titularId: string;
  titularNome: string;
  titularNif: string | null;
  responsavelNome: string;
  responsavelPapel: 'cliente' | 'condutor' | 'motorista';
  responsavelClienteId: string | null;
  responsavelMotoristaId: string | null;
  contratoId: string | null;
  cobrancaId: string;
  /** Nº legal da fatura original ligada (FT/FR). Null = sem documento fiscal. */
  numeroFaturaOriginal: string | null;
  parcelas: ParcelaDetalhe[];
}

/**
 * Acordo + parcelas + outbox associada, combinados num objeto só. Lê
 * acordos_pagamento/acordo_parcelas DIRETAMENTE (RLS de staff:
 * has_renting_faturacao_access()) — NUNCA através da RPC acordo_vista_devedor(),
 * que é a vista REDUZIDA do devedor (esconde titular_nif, erros de API, e mostra
 * liquidacao_pendente sempre como "paga"). Esta é a vista interna de quem gere.
 */
export function useAcordoDetalhe(acordoId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, acordoId ?? null],
    queryFn: async (): Promise<AcordoDetalhe | null> => {
      if (!acordoId) return null;

      const { data: acordo, error: acordoErr } = await supabase
        .from('acordos_pagamento' as any)
        .select(
          'id, codigo, estado, valor_total, titular_id, titular_nome, titular_nif, ' +
            'responsavel_nome, responsavel_papel, responsavel_cliente_id, ' +
            'responsavel_motorista_id, cobranca_id, invoice_id'
        )
        .eq('id', acordoId)
        .single();
      if (acordoErr) throw acordoErr;
      const a = acordo as any;

      const { data: parcelas, error: parcelasErr } = await supabase
        .from('acordo_parcelas' as any)
        .select('id, numero, data_vencimento, valor, estado, aviso_enviado_em, invoice_rc_id')
        .eq('acordo_id', acordoId)
        .order('numero', { ascending: true });
      if (parcelasErr) throw parcelasErr;

      const parcelaIds = (parcelas ?? []).map((p: any) => p.id);
      const { data: outbox, error: outboxErr } =
        parcelaIds.length > 0
          ? await supabase
              .from('faturacao_outbox' as any)
              .select('parcela_id, estado')
              .in('parcela_id', parcelaIds)
          : { data: [] as any[], error: null };
      if (outboxErr) throw outboxErr;

      const suspensoPorParcela = new Set(
        (outbox ?? []).filter((o: any) => o.estado === 'suspenso').map((o: any) => o.parcela_id)
      );

      let numeroFaturaOriginal: string | null = null;
      if (a.invoice_id) {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('numero')
          .eq('id', a.invoice_id)
          .maybeSingle();
        numeroFaturaOriginal = (invoice as { numero: string } | null)?.numero ?? null;
      }

      // Fonte única de verdade do saldo por liquidar — a MESMA RPC que acordo_criar e
      // o worker diário já usam (cobranca_saldo_por_liquidar). Nunca recalcular a
      // partir da soma das parcelas no componente: a dívida de registo vive em
      // contrato_cobrancas e pode divergir da soma das parcelas (ex.: uma nota de
      // crédito lançada por fora do acordo). RPC criada na mesma migração
      // (20260724100001) das restantes tabelas desta feature ainda sem tipos
      // gerados — daqui o `as any`, tal como o resto das chamadas a esta RPC em
      // src/lib/acordoPagamento.ts.
      const { data: faltaPagarRpc, error: faltaPagarErr } = await supabase.rpc(
        'cobranca_saldo_por_liquidar' as any,
        { p_cobranca_id: a.cobranca_id }
      );
      if (faltaPagarErr) throw faltaPagarErr;

      // contrato_id vive em contrato_cobrancas, não em acordos_pagamento. Uma
      // segunda query separada (em vez de um embed PostgREST
      // `contrato_cobrancas!inner(contrato_id)` a partir de acordos_pagamento)
      // porque não há, neste momento, forma de confirmar contra o schema real
      // (PostgREST/schema cache) que esse embed resolve sem ambiguidade — a
      // FK existe (cobranca_id -> contrato_cobrancas.id, migração
      // 20260724100000), mas esta funcionalidade nunca correu contra a BD
      // real e o único precedente de embed para contrato_cobrancas no
      // código (src/components/administrativo/faturacao.ts) usa sempre um
      // hint de nome de constraint explícito, que aqui teríamos de adivinhar.
      // Mesma forma da query a `invoices` acima: segura, sem apostar em
      // sintaxe de embed não verificada.
      const { data: cobranca, error: cobrancaErr } = await supabase
        .from('contrato_cobrancas')
        .select('contrato_id')
        .eq('id', a.cobranca_id)
        .maybeSingle();
      if (cobrancaErr) throw cobrancaErr;
      const contratoId = (cobranca as { contrato_id: string } | null)?.contrato_id ?? null;

      return {
        id: a.id,
        codigo: a.codigo,
        estado: a.estado,
        valorTotal: Number(a.valor_total),
        faltaPagar: Number(faltaPagarRpc ?? 0),
        titularId: a.titular_id,
        titularNome: a.titular_nome,
        titularNif: a.titular_nif,
        responsavelNome: a.responsavel_nome,
        responsavelPapel: a.responsavel_papel,
        responsavelClienteId: a.responsavel_cliente_id,
        responsavelMotoristaId: a.responsavel_motorista_id,
        contratoId,
        cobrancaId: a.cobranca_id,
        numeroFaturaOriginal,
        parcelas: (parcelas ?? []).map(
          (p: any): ParcelaDetalhe => ({
            id: p.id,
            numero: p.numero,
            dataVencimento: p.data_vencimento,
            valor: Number(p.valor),
            estado: p.estado,
            avisoEnviadoEm: p.aviso_enviado_em,
            invoiceRcId: p.invoice_rc_id,
            suspenso: p.estado === 'liquidacao_pendente' && suspensoPorParcela.has(p.id),
          })
        ),
      };
    },
    enabled: !!acordoId,
  });
}

export interface AssociarDocumentoInput {
  parcelaId: string;
  numeroDocumento: string;
  cobrancaId: string;
  contratoId: string | null;
  valor: number;
}

/**
 * "Já existe — associar": o gestor confirmou manualmente no provider que o recibo já
 * foi emitido. Grava a referência em `invoices` (mirror local) e promove a parcela via
 * acordo_parcela_liquidar — SEM tocar na API do provider (é exactamente o cenário onde
 * a API já confirmou, só falta o registo local).
 *
 * A linha de `invoices` grava também cobranca_id/contrato_id/total (além de
 * tipo/numero/status) — sem isso a linha ficava invisível a qualquer lookup
 * por-cobrança no resto da app (ex.: docFiscalDaLinha/invoiceByCobranca em
 * FaturacaoTab.tsx). data_emissao é a data de HOJE (data em que este registo foi
 * feito), não a data real de emissão no provider — desconhecida numa reconciliação
 * manual como esta; é a proxy honesta, não uma data precisa inventada.
 *
 * Depois da liquidação ter sucesso, fecha também a linha de faturacao_outbox desta
 * parcela (estava 'suspenso'/needs_reconcile) — sem isto a parcela ficava liquidada
 * mas a outbox continuava a assinalar uma suspensão já resolvida. Esta actualização é
 * best-effort (nunca lança): a liquidação já teve sucesso nesse ponto, um erro aqui
 * só deixa a linha da outbox desactualizada, um problema menor e recuperável — não
 * motivo para falhar a mutação inteira e confundir quem acabou de reconciliar com
 * sucesso (mesmo padrão de registarPagamentoParcela em src/lib/acordoPagamento.ts).
 *
 * `as any` no insert: o tipo gerado (types.ts) marca `org_id` como obrigatório no
 * Insert, mas está desactualizado face à migração 20260613000003 — existe um trigger
 * (set_invoice_org_id) que o preenche sozinho a partir do contrato ou da sessão. Não
 * há necessidade (nem forma simples, aqui) de o passar explicitamente.
 *
 * Nota de risco (RLS): o INSERT em `invoices` exige has_renting_contratos_access(),
 * uma permissão DIFERENTE de has_renting_faturacao_access() usada no resto desta
 * funcionalidade (incl. no guard interno de acordo_parcela_liquidar). Um gestor com
 * acesso de faturação mas sem acesso a contratos pode ver este botão e ter o INSERT
 * silenciosamente rejeitado pela RLS — por isso o `{error}` de AMBAS as chamadas é
 * verificado e propagado (throw), nunca assumido como sucesso.
 */
export function useAssociarDocumentoExistente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      parcelaId,
      numeroDocumento,
      cobrancaId,
      contratoId,
      valor,
    }: AssociarDocumentoInput) => {
      const { data: invoice, error: invoiceErr } = await supabase
        .from('invoices')
        .insert({
          tipo: 'RC',
          numero: numeroDocumento,
          status: 'emitida',
          cobranca_id: cobrancaId,
          contrato_id: contratoId,
          total: valor,
          data_emissao: new Date().toISOString().slice(0, 10),
        } as any)
        .select('id')
        .single();
      if (invoiceErr) throw invoiceErr;
      const { error: liquidarErr } = await supabase.rpc('acordo_parcela_liquidar' as any, {
        p_parcela_id: parcelaId,
        p_invoice_id: invoice.id,
      });
      if (liquidarErr) throw liquidarErr;

      // Best-effort: a liquidação (acima) já teve sucesso — a parcela está
      // correctamente liquidada independentemente disto. Um erro aqui só deixa a
      // linha da outbox desactualizada (não crítico, recuperável).
      const { error: outboxErr } = await supabase
        .from('faturacao_outbox' as any)
        .update({
          estado: 'sucesso',
          invoice_id: invoice.id,
          needs_reconcile: false,
          ultimo_erro: null,
        })
        .eq('parcela_id', parcelaId)
        .eq('estado', 'suspenso');
      if (outboxErr) {
        console.warn(
          `Falha (não crítica) a fechar a linha de outbox da parcela ${parcelaId}:`,
          outboxErr
        );
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['acordo-detalhe'] });
      qc.invalidateQueries({ queryKey: ['acordo-vista-devedor'] });
    },
  });
}

/**
 * "Não existe — emitir": o gestor confirmou que o recibo NÃO foi emitido. Repõe a
 * linha da outbox em 'pendente' para o worker de drain (Tarefa 9 do backend) tentar
 * de novo. `.eq('estado', 'suspenso')` no update é obrigatório: sem ele, um segundo
 * clique (ou uma corrida com o próprio worker) podia repor uma linha já 'em_curso' ou
 * já 'sucesso' de volta para 'pendente' e provocar uma segunda emissão sobre a mesma
 * fatura — exactamente o que o outbox existe para impedir.
 */
export function useReemitirDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (parcelaId: string) => {
      const { error } = await supabase
        .from('faturacao_outbox' as any)
        .update({ estado: 'pendente', needs_reconcile: false, ultimo_erro: null })
        .eq('parcela_id', parcelaId)
        .eq('estado', 'suspenso');
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['acordo-detalhe'] });
    },
  });
}

/**
 * Wrapper fino sobre registarPagamentoParcela() (src/lib/acordoPagamento.ts) — invalida
 * a query do acordo no onSettled. NÃO dá toast (convenção da feature: toast fica sempre
 * no componente chamador).
 */
export function useRegistarPagamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegistarPagamentoInput) => registarPagamentoParcela(input),
    // onSettled (não onSuccess): registarPagamentoParcela() tem uma assimetria
    // deliberada — se a emissão do documento fiscal falhar, resolve com
    // {estado:'liquidacao_pendente'} (caminho normal); mas se a promoção a 'paga'
    // falhar DEPOIS do documento já ter sido emitido com sucesso, a função lança por
    // desenho ("nunca devolver 'paga' sem a BD confirmar a promoção"). Nesse caso o
    // recibo e o documento fiscal já existem — o pagamento pode ter mesmo acontecido —
    // por isso é preciso invalidar também quando a mutação rejeita, ou a UI nunca
    // reflete o estado real após essa falha.
    onSettled: (_result, _error, input) => {
      qc.invalidateQueries({ queryKey: [...QUERY_KEY_BASE, input.acordoId] });
    },
  });
}
