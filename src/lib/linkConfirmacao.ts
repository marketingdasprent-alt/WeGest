export type TipoConfirmacao = 'signup' | 'magiclink' | 'email';

const TIPOS_CONFIRMACAO: readonly string[] = ['signup', 'magiclink', 'email'];

export interface TokenConfirmacao {
  tokenHash: string;
  type: TipoConfirmacao;
}

// Motoristas vão para o painel deles; o resto para a rota por omissão (no web,
// getPostAuthRoute() devolveria /crm). O tipo vem nos metadados do signup.
export const destinoPosConfirmacao = (
  meta: Record<string, unknown> | undefined,
  rotaPadrao: string
): string =>
  meta?.tipo_utilizador === 'motorista' || meta?.cargo_nome === 'Motorista'
    ? '/motorista/painel'
    : rotaPadrao;

// Mesmo princípio do link de recuperação: o email traz o token_hash para
// /confirmar-email em vez do /verify do Supabase, que os scanners de email
// gastam. O token só se gasta no clique em Continuar.
export const lerTokenConfirmacao = (href: string): TokenConfirmacao | null => {
  const url = new URL(href);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (!tokenHash || !type || !TIPOS_CONFIRMACAO.includes(type)) return null;
  return { tokenHash, type: type as TipoConfirmacao };
};
