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
  suspenso: boolean;
  nota: string | null;
}

export interface RecibiExterno {
  id: string;
  codigo: number;
  valor: number;
  dataRecibo: string;
  metodo: string;
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
  numeroFaturaOriginal: string | null;
  parcelas: ParcelaDetalhe[];
  recibosExternos: RecibiExterno[];
}

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
        .select(
          'id, numero, data_vencimento, valor, estado, aviso_enviado_em, invoice_rc_id, recibo_id, nota'
        )
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

      const parcelaReciboIds = (parcelas ?? [])
        .map((p: any) => p.recibo_id)
        .filter((id: string | null): id is string => !!id);
      const { data: recibosCobranca, error: recibosCobrancaErr } = await supabase
        .from('recibos')
        .select('id, codigo, valor, data_recibo, metodo')
        .eq('referencia', a.cobranca_id)
        .eq('estado', 'ativo');
      if (recibosCobrancaErr) throw recibosCobrancaErr;
      const recibosExternos: RecibiExterno[] = (recibosCobranca ?? [])
        .filter((r: any) => !parcelaReciboIds.includes(r.id))
        .map((r: any) => ({
          id: r.id,
          codigo: r.codigo,
          valor: Number(r.valor),
          dataRecibo: r.data_recibo,
          metodo: r.metodo,
        }));

      let numeroFaturaOriginal: string | null = null;
      if (a.invoice_id) {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('numero')
          .eq('id', a.invoice_id)
          .maybeSingle();
        numeroFaturaOriginal = (invoice as { numero: string } | null)?.numero ?? null;
      }

      const { data: faltaPagarRpc, error: faltaPagarErr } = await supabase.rpc(
        'cobranca_saldo_por_liquidar' as any,
        { p_cobranca_id: a.cobranca_id }
      );
      if (faltaPagarErr) throw faltaPagarErr;

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
        recibosExternos,
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
            nota: p.nota,
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
      qc.invalidateQueries({ queryKey: ['acordo-vista-devedor'] });
    },
  });
}

export function useGravarNotaParcela() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ parcelaId, nota }: { parcelaId: string; nota: string }) => {
      const { error } = await supabase
        .from('acordo_parcelas' as any)
        .update({ nota: nota.trim() || null })
        .eq('id', parcelaId);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['acordo-detalhe'] });
    },
  });
}

export function useRegistarPagamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegistarPagamentoInput) => registarPagamentoParcela(input),
    onSettled: (_result, _error, input) => {
      qc.invalidateQueries({ queryKey: [...QUERY_KEY_BASE, input.acordoId] });
    },
  });
}
