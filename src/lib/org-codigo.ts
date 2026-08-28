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
 *
 * Usa a RPC org_por_codigo e não a tabela: o `anon` já não tem SELECT em
 * organizacoes. Antes tinha-o por coluna, o que deixava
 * `GET /organizacoes?select=codigo` listar os códigos de todas as
 * organizações — e o código é o que autoriza o registo de motorista numa org.
 * A RPC exige o código, devolve 2 campos e só considera orgs activas.
 *
 * Devolve null para código vazio, inexistente, inativo ou em erro.
 */
export async function resolveOrgByCodigo(codigo: string): Promise<ResolvedOrg | null> {
  const normalized = normalizeCodigo(codigo ?? '');
  if (!normalized) return null;

  const { data, error } = await supabase.rpc('org_por_codigo', {
    p_codigo: normalized,
  });

  if (error || !data) return null;
  // A RPC devolve jsonb → `Json` nos tipos gerados. O nome e os argumentos ficam
  // verificados pelo compilador; só a forma do payload é que tem de ser afirmada.
  const org = data as unknown as ResolvedOrg;
  return { id: org.id, nome: org.nome };
}
