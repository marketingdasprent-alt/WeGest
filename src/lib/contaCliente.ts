import type { User } from '@supabase/supabase-js';

/**
 * Conta criada na área de cliente do site de uma organização (registo
 * "Rent a Car"), sem nenhuma organização: o WeGest só lhe mostra um aviso.
 * A metadata sozinha não chega, porque um convite ganha ao registo e essa
 * pessoa fica colaboradora. É só UX: o acesso real é o RLS.
 */
export function ehContaDeClienteDoSite(
  user: Pick<User, 'user_metadata'> | null | undefined,
  numeroDeOrganizacoes: number
): boolean {
  return user?.user_metadata?.tipo_utilizador === 'cliente' && numeroDeOrganizacoes === 0;
}
