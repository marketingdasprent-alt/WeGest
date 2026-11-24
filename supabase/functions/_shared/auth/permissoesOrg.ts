import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4';
import type { PermissionsLookup } from './edgeAuthorization.ts';

// Mesma leitura de permissões que send-documento-fiscal-email faz inline,
// para uso com requireOrgPermission (a edge corre com service role).
// Erros de base de dados rebentam (500); só "sem membership" devolve null.
export function lookupPermissoesOrg(client: SupabaseClient): PermissionsLookup {
  return async (userId, orgId) => {
    const { data: membro, error } = await client.from('user_organizacoes')
      .select('is_admin, cargo_id').eq('user_id', userId).eq('org_id', orgId).maybeSingle();
    if (error) throw error;
    if (!membro) return null;
    if (membro.is_admin || !membro.cargo_id) return { is_admin: !!membro.is_admin, recursos: [] };
    // Uma pessoa pode ter vários grupos: contam as permissões de todos.
    const { data: grupos, error: gruposErro } = await client.rpc('cargo_ids_do_utilizador', { p_user: userId, p_org: orgId });
    if (gruposErro) throw gruposErro;
    const cargoIds: string[] = Array.isArray(grupos) && grupos.length > 0 ? grupos : [membro.cargo_id];
    const { data: perms, error: permsErro } = await client.from('cargo_permissoes')
      .select('recursos(nome)').in('cargo_id', cargoIds).eq('tem_acesso', true);
    if (permsErro) throw permsErro;
    const recursos = (perms ?? [])
      // O embed chega como objecto ou lista, conforme a relação inferida.
      .flatMap((p: { recursos: unknown }) => [p.recursos].flat().map((r) => (r as { nome?: string } | null)?.nome))
      .filter((n: unknown): n is string => !!n);
    return { is_admin: false, recursos };
  };
}
