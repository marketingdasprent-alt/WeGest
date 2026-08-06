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

/**
 * Folhas de Danos (`anexo_danos`) activas da ORGANIZAÇÃO, sem filtrar por
 * empresa-cliente.
 *
 * A folha é um anexo da viatura, não um documento da empresa emissora — e o
 * resto do código já a resolve assim (fecho de contrato e check-in/out
 * procuram-na só por `tipo` + `ativo`). `useDocumentTemplates` filtra por
 * `cliente_empresa_id`, o que a escondia em quase todos os contratos: numa org
 * com vários emissores, só apareceria nos contratos do emissor a que o
 * template estivesse atribuído — e em nenhum, se estivesse a NULL.
 */
export function useFolhasDanosDaOrg(orgId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['document-templates', 'anexo-danos-org', orgId ?? null],
    enabled: enabled && !!orgId,
    queryFn: async (): Promise<DocumentTemplateRow[]> => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('id, nome, tipo, cliente_empresa_id, empresa_id')
        .eq('ativo', true)
        .eq('tipo', 'anexo_danos')
        .eq('org_id', orgId as string)
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocumentTemplateRow[];
    },
  });
}
