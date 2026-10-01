import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/utils/errorMessage';

const QUERY_KEY = 'motorista-documentos-pendentes';

export interface DocumentoPendenteMotorista {
  id: string;
  tipo_documento: string;
  nome_ficheiro: string | null;
  /** Caminho no bucket `motorista-documentos`. */
  ficheiro_url: string;
  data_validade: string | null;
  created_at: string | null;
}

/** Documentos enviados pelo motorista que aguardam validação do gestor. */
export function useDocumentosPendentesMotorista(motoristaId: string | null | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, motoristaId],
    enabled: !!motoristaId,
    queryFn: async (): Promise<DocumentoPendenteMotorista[]> => {
      const { data, error } = await supabase
        .from('motorista_documentos')
        .select('id, tipo_documento, nome_ficheiro, ficheiro_url, data_validade, created_at')
        .eq('motorista_id', motoristaId!)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

interface ResultadoAprovacao {
  aplicado_na_ficha?: boolean;
}

/**
 * Aprova: a RPC marca o documento e copia ficheiro (e validade) para a coluna
 * oficial da ficha. A permissão é verificada no servidor, não aqui.
 */
export function useAprovarDocumentoMotorista(motoristaId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (documentoId: string) => {
      const { data, error } = await supabase.rpc('aprovar_documento_motorista', {
        p_documento_id: documentoId,
      });
      if (error) throw error;
      return (data ?? {}) as ResultadoAprovacao;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, motoristaId] });
      toast.success(
        r.aplicado_na_ficha ? 'Documento aprovado e substituído na ficha' : 'Documento aprovado'
      );
    },
    onError: (e: unknown) => {
      toast.error(`Não foi possível aprovar: ${errorMessage(e)}`);
    },
  });
}

/** Rejeita com motivo — o motorista vê-o no portal e pode enviar outro. */
export function useRejeitarDocumentoMotorista(motoristaId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentoId, motivo }: { documentoId: string; motivo: string }) => {
      const { error } = await supabase.rpc('rejeitar_documento_motorista', {
        p_documento_id: documentoId,
        p_motivo: motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, motoristaId] });
      toast.success('Documento rejeitado — o motorista vê o motivo no portal');
    },
    onError: (e: unknown) => {
      toast.error(`Não foi possível rejeitar: ${errorMessage(e)}`);
    },
  });
}
