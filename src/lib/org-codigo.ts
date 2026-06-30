import { supabase } from '@/integrations/supabase/client';

export function normalizeCodigo(input: string): string {
  return input.trim().toLowerCase();
}

export interface ResolvedOrg {
  id: string;
  nome: string;
}

/**
 * Resolve o código público de uma organização para { id, nome }.
 * Query anónima (pré-login) — depende da policy pública de SELECT em organizacoes.
 * Devolve null para código vazio, inexistente, inativo ou em erro.
 */
export async function resolveOrgByCodigo(codigo: string): Promise<ResolvedOrg | null> {
  const normalized = normalizeCodigo(codigo ?? '');
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('organizacoes')
    .select('id, nome')
    .eq('codigo', normalized)
    .eq('ativa', true)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, nome: data.nome };
}
