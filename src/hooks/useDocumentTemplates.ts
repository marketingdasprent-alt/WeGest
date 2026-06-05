import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DocumentTemplateRow {
  id: string;
  nome: string;
  tipo: string;
  empresa_id: string;
}

/**
 * Templates de documentos ACTIVOS de uma empresa, ordenados por nome.
 * Usado pelos dialogs de "Gerar Documentos" (contrato, motorista).
 */
export function useDocumentTemplates(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: ['document-templates', { empresaId: empresaId ?? null }],
    enabled: !!empresaId,
    queryFn: async (): Promise<DocumentTemplateRow[]> => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('id, nome, tipo, empresa_id')
        .eq('ativo', true)
        .eq('empresa_id', empresaId as string)
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocumentTemplateRow[];
    },
  });
}
