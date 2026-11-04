export type TipoConfirmacao = 'signup' | 'magiclink' | 'email';

// Link para /confirmar-email com o token_hash, em vez do action_link do
// Supabase: o action_link gasta o token no primeiro GET e os scanners de email
// (Gmail) chegavam lá antes do utilizador. A página só verifica no clique.
export const montarLinkConfirmacao = (
  baseUrl: string,
  hashedToken: string,
  type: TipoConfirmacao
): string => {
  const url = new URL(baseUrl);
  url.pathname = '/confirmar-email';
  url.search = '';
  url.hash = '';
  url.searchParams.set('token_hash', hashedToken);
  url.searchParams.set('type', type);
  return url.toString();
};
