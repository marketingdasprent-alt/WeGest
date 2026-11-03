// Link para /reset-password com o token_hash, em vez do action_link do
// Supabase: o action_link gasta o token no primeiro GET, e os scanners de
// email (Gmail) chegavam lá antes do utilizador. A página só verifica no clique.
export const montarLinkRecuperacao = (redirectTo: string, hashedToken: string): string => {
  const url = new URL(redirectTo);
  url.searchParams.set('token_hash', hashedToken);
  url.searchParams.set('type', 'recovery');
  return url.toString();
};
