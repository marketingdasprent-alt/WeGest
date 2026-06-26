import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { type EmpresaConfig, empresaFooterText } from '@/config/empresas';

/** Converte uma row de clientes (tipo='empresa') para EmpresaConfig. */
function clienteToEmpresaConfig(row: Record<string, any>): EmpresaConfig {
  return {
    id: row.id,
    orgId: row.org_id ?? null,
    nome: row.nome_comercial || row.nome,
    nomeCompleto: row.nome_comercial || row.nome,
    nif: row.nif ?? '',
    sede: row.sede ?? '',
    licencaTVDE: row.licenca_tvde ?? '',
    licencaValidade: row.licenca_validade ?? '',
    representante: row.representante ?? '',
    cargoRepresentante: row.cargo_representante ?? '',
    papelTimbrado: row.papel_timbrado ?? '',
    logoUrl: row.logo_url ?? null,
  };
}

/**
 * Devolve os clientes de tipo='empresa' mapeados para EmpresaConfig.
 * Substitui useEmpresas() em todos os contextos de geração de documentos.
 */
export function useClientesEmpresas() {
  const { data, isLoading } = useQuery({
    queryKey: ['clientes-empresas'],
    queryFn: async (): Promise<EmpresaConfig[]> => {
      const { data, error } = await supabase
        .from('clientes')
        .select(
          'id, org_id, nome, nome_comercial, nif, sede, representante, cargo_representante, licenca_tvde, licenca_validade, papel_timbrado, logo_url'
        )
        .eq('is_emissora', true)
        .is('deleted_at', null)
        .order('nome');
      if (error) throw error;
      return (data ?? []).map(clienteToEmpresaConfig);
    },
  });

  const empresas = data ?? [];
  const getById = (id: string) => empresas.find((e) => e.id === id);

  return { empresas, loading: isLoading, getById };
}

export { empresaFooterText };
