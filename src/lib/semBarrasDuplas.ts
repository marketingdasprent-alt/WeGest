/**
 * `//confirmar-email` → `/confirmar-email`. O Site URL do Supabase tinha uma
 * barra no fim e os e-mails de confirmação saíam com `wegest.pt//confirmar-email`,
 * que o router não reconhecia (404). `null` = o caminho já está limpo.
 */
export function caminhoSemBarrasDuplas(pathname: string): string | null {
  const limpo = pathname.replace(/\/{2,}/g, '/');
  return limpo === pathname ? null : limpo;
}
