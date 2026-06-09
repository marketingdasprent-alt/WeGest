import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DocumentTemplateRow {
  id: string;
  nome: string;
  tipo: string;
  cliente_empresa_id: string | null;
  empresa_id: string | null;
}

/**
 * Templates de documentos ACTIVOS de uma empresa-cliente, ordenados por nome.
 * Filtra por `cliente_empresa_id` (UUID de clientes).
 * Usado pelos dialogs "Gerar Documentos" (contrato, motorista).
 */
export function useDocumentTemplates(clienteEmpresaId: string | null | undefined) {
  return useQuery({
    queryKey: ['document-templates', { clienteEmpresaId: clienteEmpresaId ?? null }],
    enabled: !!clienteEmpresaId,
    queryFn: async (): Promise<DocumentTemplateRow[]> => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('id, nome, tipo, cliente_empresa_id, empresa_id')
        .eq('ativo', true)
        .eq('cliente_empresa_id', clienteEmpresaId as string)
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocumentTemplateRow[];
    },
  });
}
