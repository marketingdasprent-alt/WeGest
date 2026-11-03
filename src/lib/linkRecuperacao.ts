// O link de recuperação traz o token_hash para esta página em vez de ir direto
// ao /verify do Supabase: scanners de email (Gmail) abriam esse link e gastavam
// o token antes do utilizador. Aqui o token só se gasta no clique em Continuar.
export const lerTokenRecuperacao = (href: string): string | null => {
  const url = new URL(href);
  const tokenHash = url.searchParams.get('token_hash');
  if (!tokenHash || url.searchParams.get('type') !== 'recovery') return null;
  return tokenHash;
};
