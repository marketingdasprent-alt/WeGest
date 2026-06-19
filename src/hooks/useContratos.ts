import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GerarContratoParams {
  motoristaId: string;
  empresaId: string;
  motoristaNome: string;
  motoristaNif?: string | null;
  motoristaEmail?: string | null;
  motoristaTelefone?: string | null;
  motoristaMorada?: string | null;
  motoristaDocumentoTipo?: string | null;
  motoristaDocumentoNumero?: string | null;
  cidadeAssinatura: string;
  dataAssinatura: string;
  dataInicio: string;
  duracaoMeses?: number;
  criadoPor?: string | null;
  forceNewVersion?: boolean;
  viaturaId?: string | null;
  calendarioEventoId?: string | null;
}

export interface GerarContratoResult {
  id: string;
  numero_contrato: number;
  versao: number;
  [key: string]: unknown;
}

/**
 * Invoca a RPC `gerar_contrato_atomico` no Supabase com nomes de campos
 * em camelCase (a função converte para os parâmetros p_xxx que a RPC espera).
 */
export async function gerarContratoAtomico(
  params: GerarContratoParams
): Promise<GerarContratoResult> {
  const rpcParams: Record<string, unknown> = {
    p_motorista_id: params.motoristaId,
    p_empresa_id: params.empresaId,
    p_motorista_nome: params.motoristaNome,
    p_motorista_nif: params.motoristaNif ?? null,
    p_motorista_email: params.motoristaEmail ?? null,
    p_motorista_telefone: params.motoristaTelefone ?? null,
    p_motorista_morada: params.motoristaMorada ?? null,
    p_motorista_documento_tipo: params.motoristaDocumentoTipo ?? null,
    p_motorista_documento_numero: params.motoristaDocumentoNumero ?? null,
    p_cidade_assinatura: params.cidadeAssinatura,
    p_data_assinatura: params.dataAssinatura,
    p_data_inicio: params.dataInicio,
    p_duracao_meses: params.duracaoMeses ?? 12,
    p_criado_por: params.criadoPor ?? null,
    p_force_new_version: params.forceNewVersion ?? false,
  };

  if (params.viaturaId !== undefined) rpcParams.p_viatura_id = params.viaturaId;
  if (params.calendarioEventoId !== undefined)
    rpcParams.p_calendario_evento_id = params.calendarioEventoId;

  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      params: Record<string, unknown>
    ) => Promise<{ data: GerarContratoResult | GerarContratoResult[] | null; error: Error | null }>
  )('gerar_contrato_atomico', rpcParams);
  if (error) throw error;
  if (!data) throw new Error('RPC gerar_contrato_atomico não retornou dados');
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Hook React Query wrapper para `gerar_contrato_atomico`. Invalida a
 * query de contratos no sucesso. Use a função `gerarContratoAtomico`
 * diretamente se precisar de orquestrar várias chamadas sequenciais.
 */
export function useGerarContratoAtomico() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: gerarContratoAtomico,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contratos'] });
    },
  });
}
