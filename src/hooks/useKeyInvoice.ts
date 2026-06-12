/**
 * Hooks React Query para a faturação KeyInvoice.
 * Emissão (FT/FR/NC) corre na edge function `keyinvoice-emitir`, que também
 * grava o espelho local em `invoices`. Aqui só invocamos e lemos.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emitirDocumento, checkKeyInvoiceHealth } from '@/lib/keyinvoice';
import { supabase } from '@/integrations/supabase/client';
import type { CreateFaturaPayload, EmitResult, InvoiceMetadata } from '@/types/keyinvoice';
import { useToast } from './use-toast';

interface UseCreateFaturaOptions {
  onSuccess?: (result: EmitResult) => void;
  onError?: (error: Error) => void;
}

const TIPO_LABEL: Record<string, string> = {
  FT: 'Fatura',
  FR: 'Fatura-Recibo',
  NC: 'Nota de Crédito',
};

/**
 * Emite um documento no KeyInvoice (via edge function).
 */
export function useCreateFatura(options?: UseCreateFaturaOptions) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: CreateFaturaPayload) => emitirDocumento(payload),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['invoices-by-contrato'] });
      const ki = result.keyinvoice;
      toast({
        title: result.warning ? 'Documento emitido (aviso)' : 'Documento emitido',
        description:
          result.warning ??
          `${TIPO_LABEL[result.invoice?.tipo ?? ''] ?? 'Documento'} ${ki?.FullDocNumber ?? ''}`.trim(),
        variant: result.warning ? 'default' : undefined,
      });
      options?.onSuccess?.(result);
    },
    onError: (error) => {
      toast({
        title: 'Erro ao emitir',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
      options?.onError?.(error as Error);
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
      // `invoices` ainda não está nos tipos gerados — cast até regenerar.
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as InvoiceMetadata[];
    },
  });
}

/**
 * Health-check do serviço de faturação (a edge function autentica no KeyInvoice).
 */
export function useKeyInvoiceHealth() {
  return useQuery({
    queryKey: ['keyinvoice-health'],
    queryFn: checkKeyInvoiceHealth,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
