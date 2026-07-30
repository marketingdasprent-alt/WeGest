/**
 * Hooks React Query para a faturação fiscal (provider-agnostic).
 * A emissão (FT/FR/NC) corre na edge function `faturacao-emitir`, que despacha
 * para o software configurado por organização e grava o espelho local em
 * `invoices`. Aqui só invocamos e lemos.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emitirDocumento, checkFaturacaoHealth } from '@/lib/faturacao';
import { supabase } from '@/integrations/supabase/client';
import type { CreateFaturaPayload, EmitResult, InvoiceMetadata } from '@/types/faturacao';

export interface EmitirEEscreverInput {
  payload: CreateFaturaPayload;
  /** Cobrança a que o documento fiscal fica ligado (write-back do nº). */
  cobrancaId: string;
  /** Contrato — só para invalidar as queries certas. */
  contratoId: string;
}

export interface EmitirEEscreverResult extends EmitResult {
  /** `true` se o nº foi gravado em `contrato_cobrancas.documento_externo_ref`. */
  wroteBackRef: boolean;
  fullDocNumber: string | null;
}

/**
 * Emite um documento fiscal E grava o nº na cobrança (idempotente).
 *
 * O write-back só ocorre quando `documento_externo_ref IS NULL` — protege contra
 * emissão dupla. Cobre também o caminho `warning` da edge function (provider
 * emitiu mas falhou gravar o espelho local): o nº fiscal é gravado na mesma.
 * Usado tanto pela faturação inicial como pelo botão "Reemitir".
 */
export function useEmitirEEscreverFatura() {
  const qc = useQueryClient();
  return useMutation<EmitirEEscreverResult, Error, EmitirEEscreverInput>({
    mutationFn: async ({ payload, cobrancaId }) => {
      const res = await emitirDocumento(payload);
      const fullDocNumber = res.provider?.FullDocNumber ?? res.invoice?.numero ?? null;
      let wroteBackRef = false;
      if (fullDocNumber) {
        const { data, error } = await supabase
          .from('contrato_cobrancas')
          .update({ documento_externo_ref: fullDocNumber })
          .eq('id', cobrancaId)
          .is('documento_externo_ref', null)
          .select('id');
        if (!error && data && data.length > 0) wroteBackRef = true;
      }
      return { ...res, wroteBackRef, fullDocNumber };
    },
    onSuccess: (_res, { contratoId }) => {
      qc.invalidateQueries({ queryKey: ['contrato-cobrancas', contratoId] });
      qc.invalidateQueries({ queryKey: ['invoices-by-contrato', contratoId] });
      qc.invalidateQueries({ queryKey: ['renting'] });
    },
  });
}

/**
 * Lista os documentos emitidos para um contrato.
 */
export function useInvoicesByContrato(contratoId: string) {
  return useQuery({
    queryKey: ['invoices-by-contrato', contratoId],
    enabled: !!contratoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as InvoiceMetadata[];
    },
  });
}

/**
 * Um documento fiscal por id (para pré-visualização — DocumentoPreviewDialog).
 */
export async function fetchInvoiceById(invoiceId: string): Promise<InvoiceMetadata> {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
  if (error) throw error;
  return data as unknown as InvoiceMetadata;
}

/**
 * Health-check do serviço de faturação (a edge function autentica no provider).
 */
export function useFaturacaoHealth() {
  return useQuery({
    queryKey: ['faturacao-health'],
    queryFn: checkFaturacaoHealth,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
