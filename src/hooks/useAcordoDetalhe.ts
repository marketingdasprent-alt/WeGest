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
