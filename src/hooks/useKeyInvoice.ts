/**
 * Hook React Query para integração KeyInvoice
 * Gerencia criação de Faturas, Faturas-Recibo e Notas de Crédito
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFatura, checkKeyInvoiceHealth, type FaturaResponse } from '@/lib/keyinvoice';
import { supabase } from '@/integrations/supabase/client';
import type { CreateFaturaPayload, InvoiceMetadata } from '@/types/keyinvoice';
import { useToast } from './use-toast';

interface UseCreateFaturaOptions {
  onSuccess?: (fatura: FaturaResponse & { metadata: InvoiceMetadata }) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook para criar fatura no KeyInvoice e guardar metadata no Supabase.
 */
export function useCreateFatura(options?: UseCreateFaturaOptions) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: CreateFaturaPayload & { contrato_id: string }) => {
      // 1. Criar fatura no KeyInvoice
      const faturaKeyInvoice = await createFatura(payload);

      // 2. Guardar metadata no Supabase
      const { data: metadata, error: dbError } = await (supabase.from('invoices') as any)
        .insert({
          contrato_id: payload.contrato_id,
          tipo: payload.tipo,
          keyinvoice_numero: faturaKeyInvoice.numero,
          keyinvoice_serie: faturaKeyInvoice.serie,
          keyinvoice_data: faturaKeyInvoice.data,
          url_pdf: faturaKeyInvoice.url_pdf,
          total: faturaKeyInvoice.total,
          referencia_externa: payload.referencia_externa,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      return { ...faturaKeyInvoice, metadata: metadata as InvoiceMetadata };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoices-by-contrato'] });
      toast({
        title: 'Fatura criada',
        description: `${data.metadata.tipo} #${data.numero}`,
      });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Erro ao criar fatura';
      toast({
        title: 'Erro',
        description: msg,
        variant: 'destructive',
      });
      options?.onError?.(error as Error);
    },
  });
}

/**
 * Hook para listar faturas de um contrato.
 */
export function useInvoicesByContrato(contratoId: string) {
  return useQuery({
    queryKey: ['invoices-by-contrato', contratoId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('invoices') as any)
        .select('*')
        .eq('contrato_id', contratoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as InvoiceMetadata[];
    },
  });
}

/**
 * Hook para verificar se KeyInvoice está disponível.
 */
export function useKeyInvoiceHealth() {
  return useQuery({
    queryKey: ['keyinvoice-health'],
    queryFn: checkKeyInvoiceHealth,
    staleTime: 5 * 60 * 1000, // 5 minutos
    retry: false,
  });
}
